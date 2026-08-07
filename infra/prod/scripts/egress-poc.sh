#!/bin/bash
set -eu

PROJECT_ROOT="/home/ubuntu/docker/project/S15P11E106"
BASE_COMPOSE_FILE="$PROJECT_ROOT/infra/prod/docker-compose.prod.yml"
EGRESS_COMPOSE_FILE="$PROJECT_ROOT/infra/prod/docker-compose.egress-poc.yml"
ENV_FILE="/home/ubuntu/docker/project/.env"
POC_OUTPUT_ROOT="${EGRESS_POC_OUTPUT_ROOT:-/srv/melly/uploads/egress-poc}"
ACTION="${1:-status}"

compose() {
  docker compose \
    -p project \
    --env-file "$ENV_FILE" \
    -f "$BASE_COMPOSE_FILE" \
    -f "$EGRESS_COMPOSE_FILE" \
    "$@"
}

validate() {
  compose config --quiet
}

require_running_service() {
  service="$1"
  if ! compose ps --status running --services | grep -qx "$service"; then
    echo "Required service is not running: $service" >&2
    exit 1
  fi
}

case "$ACTION" in
  validate)
    validate
    echo "Egress PoC Compose validation passed."
    ;;
  start)
    validate
    require_running_service redis
    require_running_service livekit
    sudo install -d -m 0777 "$POC_OUTPUT_ROOT"
    compose pull egress
    # 기존 서비스는 변경하거나 재시작하지 않는다.
    compose up -d --no-deps egress
    compose ps egress
    ;;
  status)
    compose ps egress
    ;;
  logs)
    compose logs --since=10m egress
    ;;
  stop)
    compose stop -t 30 egress
    ;;
  remove)
    compose rm -f -s egress
    ;;
  *)
    echo "Usage: $0 {validate|start|status|logs|stop|remove}" >&2
    exit 2
    ;;
esac
