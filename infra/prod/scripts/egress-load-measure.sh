#!/bin/bash
set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-/home/ubuntu/docker/project/S15P11E106}"
BASE_COMPOSE_FILE="${BASE_COMPOSE_FILE:-$PROJECT_ROOT/infra/prod/docker-compose.prod.yml}"
EGRESS_COMPOSE_FILE="${EGRESS_COMPOSE_FILE:-$PROJECT_ROOT/infra/prod/docker-compose.egress-poc.yml}"
ENV_FILE="${ENV_FILE:-/home/ubuntu/docker/project/.env}"
LK_BIN="${LK_BIN:-lk}"
REQUEST_TEMPLATE="${REQUEST_TEMPLATE:-$PROJECT_ROOT/infra/prod/egress-poc-request.example.json}"
RESULT_DIR="${RESULT_DIR:-/tmp/melly-egress-poc}"
ROOM_NAME="${ROOM_NAME:-melly-egress-load-$(date +%s)}"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
METRICS_FILE="$RESULT_DIR/load-metrics-$RUN_ID.csv"
LOAD_LOG="$RESULT_DIR/load-test-$RUN_ID.log"
START_LOG="$RESULT_DIR/egress-start-$RUN_ID.log"
EGRESS_LOG="$RESULT_DIR/egress-$RUN_ID.log"
RUNTIME_REQUEST="$RESULT_DIR/request-$RUN_ID.json"
LOAD_PID=""
START_PID=""
EGRESS_STARTED="false"

compose() {
  docker compose \
    -p project \
    --env-file "$ENV_FILE" \
    -f "$BASE_COMPOSE_FILE" \
    -f "$EGRESS_COMPOSE_FILE" \
    "$@"
}

cleanup() {
  if [ -n "$LOAD_PID" ] && kill -0 "$LOAD_PID" 2>/dev/null; then
    kill "$LOAD_PID" 2>/dev/null || true
  fi
  if [ -n "$START_PID" ] && kill -0 "$START_PID" 2>/dev/null; then
    kill "$START_PID" 2>/dev/null || true
  fi
  if [ "$EGRESS_STARTED" = "true" ]; then
    compose stop -t 30 egress >/dev/null 2>&1 || true
    compose rm -f -s egress >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

read_env_value() {
  key="$1"
  sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1 | tr -d '\r'
}

host_cpu_percent() {
  read -r _ user1 nice1 system1 idle1 iowait1 irq1 softirq1 steal1 _ < /proc/stat
  total1=$((user1 + nice1 + system1 + idle1 + iowait1 + irq1 + softirq1 + steal1))
  idle_total1=$((idle1 + iowait1))
  sleep 1
  read -r _ user2 nice2 system2 idle2 iowait2 irq2 softirq2 steal2 _ < /proc/stat
  total2=$((user2 + nice2 + system2 + idle2 + iowait2 + irq2 + softirq2 + steal2))
  idle_total2=$((idle2 + iowait2))
  total_delta=$((total2 - total1))
  idle_delta=$((idle_total2 - idle_total1))
  awk -v total="$total_delta" -v idle="$idle_delta" \
    'BEGIN { if (total == 0) print "0.00"; else printf "%.2f", (total-idle)*100/total }'
}

sample() {
  phase="$1"
  timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  host_cpu="$(host_cpu_percent)"
  load1="$(cut -d ' ' -f 1 /proc/loadavg)"
  mem_available_kb="$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)"

  printf 'host,%s,%s,%s,%s,%s,,,\n' \
    "$phase" "$timestamp" "$host_cpu" "$load1" "$mem_available_kb" >> "$METRICS_FILE"

  docker stats --no-stream \
    --format "container,$phase,$timestamp,,,$mem_available_kb,{{.Name}},{{.CPUPerc}},{{.MemUsage}}" \
    backend livekit livekit-egress-poc 2>/dev/null >> "$METRICS_FILE" || true
}

sample_phase() {
  phase="$1"
  count="$2"
  index=1
  while [ "$index" -le "$count" ]; do
    sample "$phase"
    index=$((index + 1))
    sleep 1
  done
}

for required_file in "$BASE_COMPOSE_FILE" "$EGRESS_COMPOSE_FILE" "$ENV_FILE" "$REQUEST_TEMPLATE"; do
  if [ ! -e "$required_file" ]; then
    echo "Required file is missing: $required_file" >&2
    exit 1
  fi
done

if ! command -v "$LK_BIN" >/dev/null 2>&1 && [ ! -x "$LK_BIN" ]; then
  echo "LiveKit CLI is missing: $LK_BIN" >&2
  exit 1
fi

if docker ps -a --format '{{.Names}}' | grep -qx 'livekit-egress-poc'; then
  echo "livekit-egress-poc already exists; stop or remove it before measuring." >&2
  exit 1
fi

mkdir -p "$RESULT_DIR"

export LIVEKIT_API_KEY="$(read_env_value LIVEKIT_API_KEY)"
export LIVEKIT_API_SECRET="$(read_env_value LIVEKIT_API_SECRET)"
export LIVEKIT_URL="$(read_env_value LIVEKIT_URL)"

if [ -z "$LIVEKIT_API_KEY" ] || [ -z "$LIVEKIT_API_SECRET" ] || [ -z "$LIVEKIT_URL" ]; then
  echo "LiveKit credentials or URL are missing." >&2
  exit 1
fi

sed "s/melly-egress-poc/$ROOM_NAME/g" "$REQUEST_TEMPLATE" > "$RUNTIME_REQUEST"
printf 'kind,phase,timestamp,host_cpu_percent,load1,mem_available_kb,container,container_cpu_percent,container_memory\n' > "$METRICS_FILE"

echo "START room=$ROOM_NAME metrics=$METRICS_FILE"
compose config --quiet
sudo install -d -m 0777 /srv/melly/uploads/egress-poc
compose up -d --no-deps egress
EGRESS_STARTED="true"

for _ in $(seq 1 30); do
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' livekit-egress-poc 2>/dev/null || true)"
  if [ "$health" = "healthy" ]; then
    break
  fi
  sleep 2
done

if [ "${health:-}" != "healthy" ]; then
  echo "Egress did not become healthy: ${health:-missing}" >&2
  exit 1
fi

echo "PHASE idle"
sample_phase idle 5

"$LK_BIN" load-test \
  --room "$ROOM_NAME" \
  --duration 90s \
  --video-publishers 2 \
  --audio-publishers 2 \
  --subscribers 2 \
  --identity-prefix egress-load \
  --video-resolution high > "$LOAD_LOG" 2>&1 &
LOAD_PID=$!

sleep 8
"$LK_BIN" egress start --type room-composite "$RUNTIME_REQUEST" > "$START_LOG" 2>&1 &
START_PID=$!

echo "PHASE recording"
sample_phase recording 20

load_rc=0
wait "$LOAD_PID" || load_rc=$?
LOAD_PID=""
start_rc=0
wait "$START_PID" || start_rc=$?
START_PID=""

complete="false"
for _ in $(seq 1 20); do
  if docker logs livekit-egress-poc 2>&1 | grep -q 'egress_complete'; then
    complete="true"
    break
  fi
  sleep 2
done

docker logs livekit-egress-poc > "$EGRESS_LOG" 2>&1 || true

echo "PHASE recovery"
sample_phase recovery 5

egress_error_count="$(grep -Ec '"error":"[^" ]+' "$EGRESS_LOG" || true)"
dropped="$(grep -o '"videoBuffersDropped":[0-9]*' "$EGRESS_LOG" | tail -n 1 | cut -d: -f2 || true)"
output_file="$(grep -o '/out/[^" ]*\.mp4' "$EGRESS_LOG" | tail -n 1 || true)"

echo "RESULT load_rc=$load_rc start_rc=$start_rc complete=$complete errors=$egress_error_count dropped=${dropped:-unknown} output=${output_file:-unknown}"
echo "FILES metrics=$METRICS_FILE load_log=$LOAD_LOG start_log=$START_LOG egress_log=$EGRESS_LOG"

if [ "$load_rc" -ne 0 ] || [ "$start_rc" -ne 0 ] || [ "$complete" != "true" ] || [ "$egress_error_count" -ne 0 ]; then
  exit 1
fi
