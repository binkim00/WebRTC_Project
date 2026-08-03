#!/bin/bash
set -e

PROJECT_ROOT="/home/ubuntu/docker/project/S15P11E106"
COMPOSE_FILE="$PROJECT_ROOT/infra/prod/docker-compose.prod.yml"
ENV_FILE="/home/ubuntu/docker/project/.env"

cd "$PROJECT_ROOT"

# 필수 변수 치환과 최종 Compose 문법을 컨테이너 변경 전에 검증한다.
docker compose \
  -p project \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  config --quiet

docker compose \
  -p project \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  build --pull backend frontend

docker compose \
  -p project \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  up -d mysql redis livekit backend frontend nginx

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
