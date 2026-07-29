#!/bin/bash
set -e

PROJECT_ROOT="/home/ubuntu/docker/project/S15P11E106"
COMPOSE_FILE="$PROJECT_ROOT/infra/prod/docker-compose.prod.yml"
ENV_FILE="/home/ubuntu/docker/project/.env"

cd "$PROJECT_ROOT"

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

docker compose \
  -p project \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  ps
