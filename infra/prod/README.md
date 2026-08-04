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

### Rollback

배포가 실패하면 코드에서 이전 검증된 커밋의 LiveKit Compose 설정을 복구한 뒤 같은
`deploy.sh`를 다시 실행합니다. 데이터베이스 변경은 없으므로 DB rollback은 필요하지
않습니다. 이전 파일 마운트 방식으로 되돌리면 webhook 설정도 함께 사라져 자동 통화
시작과 종료가 다시 멈출 수 있으므로, rollback 후에는 수동 종료 절차를 사용하고
LiveKit 및 backend 로그를 확인합니다. 운영 `.env`나 secret 값 자체는 변경하지 않습니다.

## AI 에이전트 (ai-agent)

자막(DeepL Voice / Google STT)과 통화 요약을 담당하는 LiveKit worker 입니다. 백엔드 API를
호출하지 않고 MySQL에 직접 쓰며, LiveKit에는 내부 네트워크(`ws://livekit:7880`)로 붙습니다.
`WorkerOptions`에 `agent_name`을 지정하지 않으므로 room 생성 시 자동 dispatch 됩니다.

이미지는 `ai/requirements.lock`으로 빌드합니다. `requirements.txt`는 직접 의존성 목록이며
버전이 고정되어 있지 않습니다. `livekit-agents`는 0.x와 1.x의 API가 서로 다르므로, 검증된
조합(`livekit-agents 1.6.6` / `livekit 1.1.13`)을 유지하려면 lock을 갱신해 배포합니다.

운영 `.env`에 다음 키가 필요합니다. `LANGSMITH_PROJECT`는 따옴표 없이 적습니다.

```text
DEEPL_API_KEY=
GMS_API_KEY=
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT=https://apac.api.smith.langchain.com
LANGSMITH_API_KEY=
LANGSMITH_PROJECT=Melly
```

`GOOGLE_APPLICATION_CREDENTIALS`는 `.env`에 넣지 않습니다. Compose가 컨테이너 안의 경로로
고정하고, 실제 서비스 계정 키 파일은 호스트에 두고 읽기 전용으로 마운트합니다.

```bash
mkdir -p /home/ubuntu/docker/project/secrets
# google-credentials.json 을 위 디렉터리에 저장한 뒤
chmod 600 /home/ubuntu/docker/project/secrets/google-credentials.json
```

키 파일은 저장소 안에 두지 않습니다. `ai/` 아래에 두면 `Dockerfile`의 `COPY . .`가 이미지
레이어에 그대로 굽습니다(`ai/.dockerignore`로 1차 차단해 두었습니다). 파일이 없으면
`deploy.sh`는 경고를 남기고 `ai-agent`만 건너뜁니다. Docker는 없는 마운트 소스를 빈
디렉터리로 만들어 버려서, 그대로 올리면 컨테이너가 기동 직후 조용히 깨집니다.

기동 확인은 로그로 합니다.

```bash
docker compose -p project --env-file /home/ubuntu/docker/project/.env \
  -f infra/prod/docker-compose.prod.yml logs --since=5m ai-agent
```

LiveKit에 worker로 등록되었는지, DB 연결 풀이 초기화되었는지를 확인합니다. 자막이 나오지
않을 때는 `DEEPL_API_KEY`(외국어 통화)와 서비스 계정 키(한국어 통화)를 나눠서 봅니다.
요약이 비면 `GMS_API_KEY`와 `gms.ssafy.io` 아웃바운드를 확인합니다.

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
- `ai-agent`
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
| ai-agent | 같은 마운트, **`TZ` 미설정** | `python:3.11-slim`의 tzdata 포함 여부를 실측하지 못했다. 마운트는 tzdata 유무와 무관하게 동작하므로 안전한 쪽을 택했다. DB에 쓰는 시각은 `ai/db/timeutil.py`가 KST 고정 오프셋으로 만들어 이 설정과 무관하다 |

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
