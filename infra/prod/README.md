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

## 주의사항

- `archive/`는 백업/구성 보관용입니다. 운영 Compose에는 포함되지 않습니다.
- `infra/prod/.env`는 운영 스크립트에 의해 항상 `/home/ubuntu/docker/project/.env`를 참조합니다.
- 운영 중에는 `docker/project/.env`를 직접 편집하거나 백업 복사본을 만들 때 주의하세요.
