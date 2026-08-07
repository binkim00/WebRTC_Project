#!/bin/bash
set -eu

PROJECT_ROOT="/home/ubuntu/docker/project/S15P11E106"
COMPOSE_FILE="$PROJECT_ROOT/infra/prod/docker-compose.prod.yml"
ENV_FILE="/home/ubuntu/docker/project/.env"
RECORDING_ROOT="${RECORDING_STORAGE_ROOT:-/srv/melly/uploads}"

section() {
  echo
  echo "[$1]"
}

section "system"
printf 'checked_at=' && date --iso-8601=seconds
printf 'logical_cpus=' && nproc
free -h

section "disk"
df -h / "$RECORDING_ROOT" 2>/dev/null || df -h /
if [ -d "$RECORDING_ROOT" ]; then
  du -sh "$RECORDING_ROOT"
else
  echo "recording_root_missing=$RECORDING_ROOT"
fi

section "docker"
docker info --format 'docker_cpus={{.NCPU}} docker_memory_bytes={{.MemTotal}}'

section "compose_services"
docker compose \
  -p project \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  ps --format 'table {{.Service}}\t{{.Status}}'

section "container_usage_snapshot"
docker stats --no-stream \
  --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.BlockIO}}\t{{.PIDs}}'

section "configured_resource_limits"
if docker compose \
  -p project \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  config | grep -Eq 'cpus:|memory:|mem_limit:'; then
  echo "resource_limits_configured=yes"
else
  echo "resource_limits_configured=no"
fi

section "egress_initial_gate"
echo "room_composite_reference_cpu_cost=3.0"
echo "poc_concurrency=1"
echo "Review available CPU, memory, disk, and the container snapshot before starting Egress."
