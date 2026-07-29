# Local Development (`infra/local`)

This directory contains local development compose and LiveKit config.

## Start local stack

```bash
git clone ...  # if needed
cd /home/ubuntu/docker/project/S15P11E106/infra/local
cp .env.example .env
# adjust .env values if desired
docker compose --env-file .env -f docker-compose.local.yml up -d
```

## Stop local stack

```bash
docker compose --env-file .env -f docker-compose.local.yml down -v
```

## Services

- mysql
- redis
- livekit
- backend
- frontend
- portainer
- nginx
- jenkins (optional local build)

## Notes

- Local `docker-compose.local.yml` uses named volumes for MySQL and Redis and isolates them on `melly-local-network`.
- `livekit.local.yaml` is mounted read-only into LiveKit.
- Use `.env.example` as the template and keep secrets out of version control.
