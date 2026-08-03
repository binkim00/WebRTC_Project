# Production Deployment (infra/prod)

이 디렉터리는 운영 서버의 단일 소스입니다.

## 주요 구성

- `docker-compose.prod.yml`: 프로덕션 서비스 정의
- `.env`: 루트 `/home/ubuntu/docker/project/.env`로 연결된 심볼릭 링크
- `scripts/deploy.sh`: 빌드, 실행, 상태 확인을 한 번에 실행하는 스크립트

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
