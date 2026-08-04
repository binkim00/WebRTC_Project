#!/bin/bash
set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-/home/ubuntu/docker/project/S15P11E106}"
COMPOSE_FILE="$PROJECT_ROOT/infra/prod/docker-compose.prod.yml"
ENV_FILE="${ENV_FILE:-/home/ubuntu/docker/project/.env}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-project}"

compose() {
  docker compose -p "$PROJECT_NAME" --env-file "$ENV_FILE" \
    -f "$COMPOSE_FILE" --profile egress "$@"
}

setting() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key {sub(/^[^=]*=/, ""); print; exit}' "$ENV_FILE" \
    | tr -d '\r' | xargs
}

require_mode() {
  local expected="$1"
  local actual
  actual="$(setting RECORDING_EGRESS_ENABLED)"
  if [[ "$actual" != "$expected" ]]; then
    echo "RECORDING_EGRESS_ENABLED=$expected 로 설정한 뒤 다시 실행하세요. 현재값=${actual:-미설정}" >&2
    exit 1
  fi
}

validate() {
  test -f "$ENV_FILE" || { echo "환경 파일이 없습니다: $ENV_FILE" >&2; exit 1; }
  compose config --quiet

  local storage_root output_root max_concurrent
  storage_root="$(setting RECORDING_STORAGE_ROOT)"
  output_root="$(setting RECORDING_EGRESS_OUTPUT_ROOT)"
  max_concurrent="$(setting RECORDING_EGRESS_MAX_CONCURRENT)"

  [[ "$storage_root" == /srv/melly/uploads* ]] || {
    echo "RECORDING_STORAGE_ROOT는 /srv/melly/uploads 아래의 절대 경로여야 합니다." >&2
    exit 1
  }
  [[ "$output_root" == "/out" ]] || {
    echo "RECORDING_EGRESS_OUTPUT_ROOT는 worker 공유 볼륨 경로 /out이어야 합니다." >&2
    exit 1
  }
  [[ "$max_concurrent" == "1" ]] || {
    echo "현재 4 vCPU 서버에서는 RECORDING_EGRESS_MAX_CONCURRENT=1만 허용합니다." >&2
    exit 1
  }
  [[ -d "$storage_root" ]] || {
    echo "공유 저장소가 없습니다: $storage_root" >&2
    exit 1
  }

  echo "Egress 운영 설정 검증 완료"
}

worker_health() {
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
    livekit-egress 2>/dev/null || echo "missing"
}

wait_worker_healthy() {
  local attempt health
  for attempt in $(seq 1 18); do
    health="$(worker_health)"
    if [[ "$health" == "healthy" ]]; then
      return 0
    fi
    sleep 5
  done
  echo "Egress worker가 제한 시간 안에 healthy가 되지 않았습니다." >&2
  return 1
}

active_slot_count() {
  compose exec -T redis redis-cli --scan --pattern 'recording:egress:capacity:*' 2>/dev/null \
    | sed '/^[[:space:]]*$/d' | wc -l | xargs
}

reload_nginx() {
  compose exec -T nginx nginx -t
  compose exec -T nginx nginx -s reload
}

start_worker() {
  require_mode false
  validate
  compose up -d egress
  wait_worker_healthy
  echo "worker만 시작했습니다. backend Egress 기능은 아직 비활성 상태입니다."
}

activate() {
  require_mode true
  validate
  [[ "$(worker_health)" == "healthy" ]] || {
    echo "먼저 RECORDING_EGRESS_ENABLED=false 상태에서 start-worker를 실행하세요." >&2
    exit 1
  }
  compose build --pull backend frontend
  compose up -d backend frontend
  reload_nginx
  compose ps backend frontend egress
}

status() {
  validate
  compose ps backend livekit redis egress
  echo "worker_health=$(worker_health) active_capacity_slots=$(active_slot_count)"
  docker stats --no-stream livekit-egress livekit backend 2>/dev/null || true
  df -h "$(setting RECORDING_STORAGE_ROOT)"
  du -sh "$(setting RECORDING_STORAGE_ROOT)/egress" 2>/dev/null || true
}

logs() {
  compose logs --since=15m --tail=300 egress backend livekit \
    | grep -E 'egress|Egress|recordingId|CPU|no resource|failed|error' || true
}

stop_worker_if_idle() {
  local slots
  slots="$(active_slot_count)"
  if [[ "$slots" != "0" ]]; then
    echo "진행 중인 Egress 용량 슬롯이 ${slots}개라 worker를 중지하지 않습니다." >&2
    exit 1
  fi
  compose stop egress
}

rollback() {
  require_mode false
  validate
  compose build --pull backend frontend
  compose up -d backend frontend
  reload_nginx

  local attempt slots
  for attempt in $(seq 1 12); do
    slots="$(active_slot_count)"
    [[ "$slots" == "0" ]] && break
    sleep 5
  done
  stop_worker_if_idle
  echo "브라우저 녹화 모드로 롤백했고 Egress worker를 중지했습니다."
}

usage() {
  echo "usage: $0 {validate|start-worker|activate|status|logs|stop-worker|rollback}"
}

case "${1:-}" in
  validate) validate ;;
  start-worker) start_worker ;;
  activate) activate ;;
  status) status ;;
  logs) logs ;;
  stop-worker) require_mode false; stop_worker_if_idle ;;
  rollback) rollback ;;
  *) usage; exit 2 ;;
esac
