#!/bin/bash
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$PROJECT_ROOT"

docker compose \
  --env-file ../.env \
  -f infra/prod/docker-compose.prod.yml \
  up -d --build
