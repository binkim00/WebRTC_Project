#!/bin/bash
set -e

PROJECT_ROOT="/home/ubuntu/docker/project/S15P11E106"
COMPOSE_FILE="$PROJECT_ROOT/infra/prod/docker-compose.prod.yml"
ENV_FILE="/home/ubuntu/docker/project/.env"

cd "$PROJECT_ROOT"

# 서버 Egress 녹화가 표준이다. 플래그가 꺼진 배포는 프론트가 브라우저
# MediaRecorder 녹화로 되돌아간 이미지를 만들기 때문에 여기서 차단한다.
# 의도적인 긴급 복구만 egress-ops.sh rollback 을 사용한다.
if ! grep -Eiq '^RECORDING_EGRESS_ENABLED=true[[:space:]]*$' "$ENV_FILE"; then
  echo "RECORDING_EGRESS_ENABLED=true 가 아닙니다. 서버 녹화(Egress)가 표준이며" >&2
  echo "브라우저 녹화로 되돌아가는 배포는 금지되어 있습니다. .env 를 확인하세요." >&2
  exit 1
fi

# 배포는 backend·frontend 컨테이너를 교체하므로 진행 중인 녹화가 있으면 통화와
# 함께 녹화 파일도 잃는다. 용량 슬롯이 비어 있을 때만 진행한다(녹화는 최대 10분).
ACTIVE_SLOTS="$(docker compose -p project --env-file "$ENV_FILE" -f "$COMPOSE_FILE" \
  exec -T redis redis-cli --scan --pattern 'recording:egress:capacity:*' 2>/dev/null \
  | sed '/^[[:space:]]*$/d' | wc -l | xargs)"
if [ "${ACTIVE_SLOTS:-0}" != "0" ]; then
  echo "진행 중인 Egress 녹화가 ${ACTIVE_SLOTS}건 있어 배포를 중단합니다. 잠시 후 다시 실행하세요." >&2
  exit 1
fi

# AI 에이전트는 Google STT 서비스 계정 키를 볼륨으로 받는다. 이 파일이 없으면 Docker 가
# 마운트 지점을 빈 디렉터리로 만들어 버려서 컨테이너가 기동 직후 조용히 깨진다.
# AI 키 배치 여부와 무관하게 나머지 서비스는 배포되어야 하므로, 없을 때는 대상에서만 뺀다.
AI_CREDENTIALS="/home/ubuntu/docker/project/secrets/google-credentials.json"
AI_AGENT="ai-agent"
if [ ! -f "$AI_CREDENTIALS" ]; then
  AI_AGENT=""
  echo "[deploy] 경고: $AI_CREDENTIALS 가 없어 ai-agent 배포를 건너뜁니다." >&2
fi

# egress 서비스는 profile 뒤에 있으므로 모든 compose 호출에 profile 을 켠다.
# frontend 빌드는 env-file 의 RECORDING_EGRESS_ENABLED=true 를 빌드 인자로 받아
# VITE_RECORDING_EGRESS_ENABLED=true 가 박힌 이미지를 만든다.

# 필수 변수 치환과 최종 Compose 문법을 컨테이너 변경 전에 검증한다.
docker compose \
  -p project \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  --profile egress \
  config --quiet

# $AI_AGENT 는 값이 없으면 인자 자체가 사라져야 하므로 의도적으로 인용하지 않는다.
docker compose \
  -p project \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  --profile egress \
  build --pull backend frontend $AI_AGENT

docker compose \
  -p project \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  --profile egress \
  up -d mysql redis livekit egress backend frontend $AI_AGENT nginx

# Egress worker 는 non-root(uid 1001) 라 출력 경로 소유권이 없으면 녹화가 끝난 뒤
# 파일 저장에서야 permission denied 로 실패한다. 배포 시점에 실제 쓰기로 확인한다.
if ! docker exec livekit-egress sh -c \
    'mkdir -p /out/egress /out/egress-backup \
     && : > /out/egress/.write-test && rm -f /out/egress/.write-test' 2>/dev/null; then
  echo "Egress worker 가 /out/egress 에 쓸 수 없습니다. 호스트에서 실행하세요:" >&2
  echo "  sudo mkdir -p /srv/melly/uploads/egress /srv/melly/uploads/egress-backup" >&2
  echo "  sudo chown -R 1001:0 /srv/melly/uploads/egress /srv/melly/uploads/egress-backup" >&2
  exit 1
fi

# nginx 는 upstream 의 호스트명을 시작 시점에 한 번만 해석해 IP 를 캐시한다.
# 위 up -d 로 backend·frontend 가 재생성되면 컨테이너 IP 가 바뀌는데, nginx 자신의
# 서비스 정의가 그대로면 재생성되지 않아 죽은 IP 를 계속 바라보고 502 를 낸다.
# Docker 가 같은 IP 를 다시 내주면 우연히 넘어가므로 확률적으로 터진다.
#
# reload 는 무중단이며, bind mount 된 nginx.conf 의 변경도 같이 반영한다.
# nginx.conf 만 고친 배포가 조용히 미적용되던 문제도 함께 해결된다.
# 잘못된 설정으로 nginx 를 죽이지 않도록 반드시 -t 로 먼저 검사한다.
docker compose \
  -p project \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  exec -T nginx nginx -t

docker compose \
  -p project \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  exec -T nginx nginx -s reload

docker compose \
  -p project \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  ps
