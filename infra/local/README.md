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

`docker-compose.local.yml` starts these three. Backend and frontend are run separately
(`./gradlew bootRun`, `npm run dev`).

- mysql
- redis
- livekit

## Ports

| Service | Host | Container | Note |
| --- | --- | --- | --- |
| MySQL | `${DB_PORT:-3306}` | 3306 | |
| Redis | `${REDIS_PORT:-6379}` | 6379 | |
| LiveKit signal (WS) | `${LIVEKIT_HTTP_PORT:-17880}` | 7880 | remappable |
| LiveKit media (TCP) | 7881 | 7881 | **must stay 1:1** |
| LiveKit media (UDP) | 7882 | 7882 | **must stay 1:1** |

### Why the media ports must be mapped 1:1

LiveKit tells the browser which address and port to send media to (ICE candidates), and it
reports the port it listens on **inside** the container. If the host port differs, the browser
cannot reach it: signalling connects, participants appear as connected, but **no video or audio
ever flows**. Only the signal port is safe to remap, because the client is given that URL
explicitly via `LIVEKIT_URL`.

### Media from another device

`LIVEKIT_NODE_IP` is the address LiveKit advertises. Keep `127.0.0.1` when the browser runs on
the same machine as Docker. To test from a phone or another PC, set it to this host's LAN IP.

## LiveKit keys

Local keys live **only** in `livekit.local.yaml`:

```yaml
keys:
  devkey: melly_local_dev_secret_1234567890abcdef
```

Do not add a `LIVEKIT_KEYS` environment variable to the local compose file. It replaces the whole
`keys` map, which removes the `devkey` entry that `webhook.api_key` refers to, and LiveKit then
exits at startup with `api_key is required to use webhooks`.

The backend must use the same pair in `backend/.env`, otherwise LiveKit rejects the tokens it
issues:

```dotenv
LIVEKIT_URL=ws://localhost:17880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=melly_local_dev_secret_1234567890abcdef
```

LiveKit refuses to start when the secret is shorter than 32 characters.

## Verifying media actually flows

Signalling can succeed while media is dead, so check the media path itself:

1. Confirm LiveKit accepts a backend-issued token:
   `curl "http://localhost:17880/rtc/validate?access_token=<token>"` should return `success`.
2. Join the call from two browsers and check `chrome://webrtc-internals` for
   `inbound-rtp` `framesDecoded` increasing on both sides. A connected state with
   `framesDecoded` stuck at 0 means the media ports or `LIVEKIT_NODE_IP` are wrong.

## Verifying the webhook

Local LiveKit sends events to `http://host.docker.internal:8080/api/v1/livekit/webhook`.
Run the backend on port 8080, join the same room as host and fan, and confirm that the backend
receives `participant_joined`. The session should change from `CONNECTING` to `ACTIVE`, with
`startedAt` and `endsAt` populated. A request with an invalid signature must be rejected.

The API key identifies the signing credential; the API secret creates and verifies its signature.
The backend and LiveKit must use the same pair. Do not print the Authorization header while
troubleshooting.

## Notes

- Local `docker-compose.local.yml` uses named volumes for MySQL and Redis and isolates them on `melly-local-network`.
- `livekit.local.yaml` is mounted read-only into LiveKit.
- Use `.env.example` as the template and keep secrets out of version control.
