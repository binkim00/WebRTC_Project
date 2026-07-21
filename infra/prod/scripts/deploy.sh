#!/bin/bash
set -e

PROJECT_ROOT="/home/ubuntu/docker/project/S15P11E106"

cd "$PROJECT_ROOT"

docker compose \
  -p project \
  --env-file ../.env \
  -f infra/prod/docker-compose.prod.yml \
  build --pull backend frontend

docker compose \
  -p project \
  --env-file ../.env \
  -f infra/prod/docker-compose.prod.yml \
  up -d mysql redis backend frontend nginx

docker compose \
  -p project \
  --env-file ../.env \
  -f infra/prod/docker-compose.prod.yml \
  ps
