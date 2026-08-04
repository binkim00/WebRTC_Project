# Production Deployment (infra/prod)

이 디렉터리는 운영 서버의 단일 소스입니다.

## 주요 구성

- `docker-compose.prod.yml`: 프로덕션 서비스 정의
- `.env`: 루트 `/home/ubuntu/docker/project/.env`로 연결된 심볼릭 링크
- `scripts/deploy.sh`: 빌드, 실행, 상태 확인을 한 번에 실행하는 스크립트

## LiveKit webhook

LiveKit은 참가자 입장 같은 서버 이벤트를 일반 API 호출과 반대 방향으로 백엔드에
알려 주는 webhook을 사용합니다. 운영 LiveKit은 다음 내부 Docker 네트워크 주소로
이벤트를 보냅니다.

```text
http://backend:8080/api/v1/livekit/webhook
```

전체 LiveKit YAML은 `docker-compose.prod.yml`의 `LIVEKIT_CONFIG`로 전달됩니다.
Compose가 배포 시점에 `LIVEKIT_API_KEY`와 `LIVEKIT_API_SECRET`을 치환하며, 같은 key가
LiveKit의 `keys`와 `webhook.api_key`에 사용됩니다. 백엔드도 이 key/secret 쌍으로
Authorization 서명과 본문 해시를 검증합니다. 두 변수 중 하나라도 없으면
`docker compose config --quiet` 단계에서 배포가 중단됩니다.

배포 전에 secret 값을 출력하지 않고 설정을 검증합니다.

```bash
docker compose -p project \
  --env-file /home/ubuntu/docker/project/.env \
  -f infra/prod/docker-compose.prod.yml \
  config --quiet
```

배포 후에는 다음처럼 전달과 수신 여부만 확인합니다. Authorization 헤더나 환경 변수
전체를 출력하는 명령은 사용하지 않습니다.

```bash
docker compose -p project --env-file /home/ubuntu/docker/project/.env \
  -f infra/prod/docker-compose.prod.yml logs --since=10m livekit backend \
  | grep -E 'webhook|participant_joined'
```

두 참가자가 입장하면 세션이 `ACTIVE`가 되고 `startedAt`/`endsAt`이 채워지는지,
남은 시간이 감소한 뒤 `ENDED`와 대기열 완료 및 다음 참가자 호출까지 이어지는지
확인합니다.

## Egress 자원 점검

Egress PoC 전에 운영 서버의 CPU, 메모리, 디스크와 현재 컨테이너 사용량을 secret 노출
없이 확인합니다.

```bash
cd /home/ubuntu/docker/project/S15P11E106
bash ./infra/prod/scripts/check-egress-capacity.sh
```

이 출력은 한 시점의 스냅샷입니다. 유휴 상태와 실제 팬미팅 진행 상태에서 각각 한 번씩
측정해야 하며, `docker stats` 결과와 녹화 파일 용량을 함께 비교합니다. Room Composite
Egress 한 건의 기준 CPU 비용은 3코어이므로 PoC에서는 동시 녹화를 1건으로 제한합니다.

## Egress PoC 컨테이너

PoC는 `docker-compose.egress-poc.yml`에 격리되어 있으며 기존 `deploy.sh`에서는 읽지
않습니다. 따라서 일반 배포로 Egress가 자동 기동되지 않습니다. 실제 팬미팅이 없는
시간에만 다음 전용 스크립트로 제어합니다.

```bash
cd /home/ubuntu/docker/project/S15P11E106

# secret을 출력하지 않고 Compose와 필수 변수를 검증
bash ./infra/prod/scripts/egress-poc.sh validate

# 이미지 pull과 PoC 컨테이너 시작
bash ./infra/prod/scripts/egress-poc.sh start

# 상태와 최근 로그 확인
bash ./infra/prod/scripts/egress-poc.sh status
bash ./infra/prod/scripts/egress-poc.sh logs

# 녹화 시험 직후 중지 및 제거
bash ./infra/prod/scripts/egress-poc.sh stop
bash ./infra/prod/scripts/egress-poc.sh remove
```

Egress는 LiveKit과 같은 API key/secret 및 Redis DB 1을 사용하고 내부 주소
`ws://livekit:7880`으로 접속합니다. 출력 파일은 기본적으로
`/srv/melly/uploads/egress-poc` 아래에만 저장합니다. 파일 출력 요청에서도 반드시
컨테이너 경로 `/out/...mp4`를 사용해야 합니다.

수동 Room Composite 요청 예시는 `egress-poc-request.example.json`에 있으며, 테스트 방
이름은 `melly-egress-poc`, 출력 경로는 `/out/{room_name}-{time}.mp4`다. 실제 서비스의
방 이름이나 녹화 파일과 섞이지 않는다.

PoC에는 다음 안전 제한이 적용됩니다.

- Egress `v1.13.0` 이미지 고정
- CPU 최대 3코어, 메모리 4GB, shared memory 1GB
- Room Composite 작업 비용 3코어로 동시 1건만 수락
- 파일 녹화 최대 10분
- 운영 포트 외부 공개 없음
- 기존 서비스 자동 시작·재시작 없음
- Chrome sandbox는 PoC에 한해 비활성화

운영 전환 시에는 Egress 전용 서버 또는 공식 seccomp profile을 사용한 Chrome sandbox
활성화를 별도로 검토합니다.

### 단일 녹화 부하 측정

`egress-load-measure.sh`는 모의 송출자 2명과 수신자 2명을 90초 동안 연결하고, 유휴·녹화·
회복 구간의 호스트 및 backend, LiveKit, Egress CPU·메모리를 CSV로 기록합니다. 실행 중인
`livekit-egress-poc` 컨테이너가 있으면 중단하며, 자신이 시작한 테스트 컨테이너만 종료 시
제거합니다. 실제 팬미팅이 없는 시간에만 실행합니다.

LiveKit CLI `lk`가 PATH에 없으면 다운로드한 실행 파일 경로를 `LK_BIN`으로 지정합니다.

```bash
cd /home/ubuntu/docker/project/S15P11E106
LK_BIN=/tmp/melly-egress-poc/lk bash ./infra/prod/scripts/egress-load-measure.sh
```

측정 CSV와 로그는 `/tmp/melly-egress-poc`에, 생성된 MP4는
`/srv/melly/uploads/egress-poc`에 남습니다. 현재 측정 결과와 해석은
`docs/livekit-egress-poc-result.md`를 참고합니다.

### Rollback

배포가 실패하면 코드에서 이전 검증된 커밋의 LiveKit Compose 설정을 복구한 뒤 같은
`deploy.sh`를 다시 실행합니다. 데이터베이스 변경은 없으므로 DB rollback은 필요하지
않습니다. 이전 파일 마운트 방식으로 되돌리면 webhook 설정도 함께 사라져 자동 통화
시작과 종료가 다시 멈출 수 있으므로, rollback 후에는 수동 종료 절차를 사용하고
LiveKit 및 backend 로그를 확인합니다. 운영 `.env`나 secret 값 자체는 변경하지 않습니다.

## 운영 원칙

1. 실제 환경 변수는 `/home/ubuntu/docker/project/.env`에만 보관합니다.
2. `infra/prod/.env`는 편의를 위한 symlink이며, `deploy.sh`는 항상 루트 `.env`를 사용합니다.
3. `docker compose`는 다음 명령으로 실행합니다:

```bash
cd /home/ubuntu/docker/project/S15P11E106/infra/prod
docker compose --env-file /home/ubuntu/docker/project/.env -f docker-compose.prod.yml up -d
```

또는 스크립트 사용:

```bash
cd /home/ubuntu/docker/project/S15P11E106/infra/prod
./scripts/deploy.sh
```

## 서비스 목록

- `mysql`
- `redis`
- `livekit`
- `backend`
- `frontend`
- `nginx`
- `jenkins`
- `portainer`

## 시간대

서비스 기준 시간대는 **한국시간(Asia/Seoul)** 입니다. 컨테이너 기본값은 UTC라서
설정을 빼면 저장되는 시각이 9시간 어긋납니다. 세 겹으로 맞춰 두었습니다.

| 위치 | 설정 | 담당 범위 |
|---|---|---|
| `backend/Dockerfile` | `ENV TZ=Asia/Seoul` + `/etc/localtime` | JVM 기본 시간대. `BaseTimeEntity`의 `created_at` 등 |
| `JwtConfig.SERVICE_ZONE` | `Clock.system(Asia/Seoul)` | `Clock` 빈을 주입받는 시각 계산 전부 |
| `docker-compose.prod.yml` | `TZ` + mysql `--default-time-zone=+09:00` | DB의 `NOW()`, 각 컨테이너 로그 시각 |

컨테이너별로 방식이 다릅니다. **livekit과 portainer에는 `TZ`를 넣으면 안 됩니다.**
두 이미지에는 tzdata가 없어 Go 런타임이 `Asia/Seoul`을 찾지 못하고, 그러면
`/etc/localtime`까지 무시한 채 UTC로 고정됩니다. 실측으로 확인한 동작입니다.

| 서비스 | 방식 | 이유 |
|---|---|---|
| backend, mysql, redis, nginx, frontend, jenkins | `TZ: Asia/Seoul` | 이미지에 tzdata 있음 |
| livekit, portainer | `/usr/share/zoneinfo/Asia/Seoul:/etc/localtime:ro` 마운트, **`TZ` 미설정** | tzdata 없음. `TZ`를 넣으면 오히려 UTC가 됨 |

마운트 방식은 호스트의 시간대 파일을 직접 붙이므로 호스트 시간대 설정과 무관합니다.
다만 호스트에 tzdata가 있어야 합니다(Ubuntu 기본 설치).

`Clock` 빈을 코드에서 고정해 두었으므로 컨테이너 `TZ`가 빠져도 업무 시각 계산은 흔들리지
않습니다. 다만 `TZ`가 없으면 `LocalDateTime.now()`를 직접 쓰는 소수 지점과 로그 시각이
UTC로 돌아가므로 둘 다 유지해야 합니다.

MySQL은 이름 있는 시간대(`Asia/Seoul`) 대신 고정 오프셋 `+09:00`을 씁니다. 이름을 쓰려면
tz 테이블을 미리 적재해야 하는데, 한국은 서머타임이 없어 두 값이 항상 같습니다.

호스트 자체의 시간대까지 맞추려면(로그인 세션, cron, `docker logs` 이외의 시스템 로그):

```bash
sudo timedatectl set-timezone Asia/Seoul
timedatectl   # Time zone: Asia/Seoul (KST, +0900) 확인
```

컨테이너는 호스트 시간대를 상속하지 않으므로 위 Compose 설정과 별개입니다.

## 주의사항

- `archive/`는 백업/구성 보관용입니다. 운영 Compose에는 포함되지 않습니다.
- `infra/prod/.env`는 운영 스크립트에 의해 항상 `/home/ubuntu/docker/project/.env`를 참조합니다.
- 운영 중에는 `docker/project/.env`를 직접 편집하거나 백업 복사본을 만들 때 주의하세요.
