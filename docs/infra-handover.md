# MELLY 인프라·LiveKit 운영 인수인계

작성일: 2026-08-04 / 기준 커밋: `f764028` / 검증 상태: 운영 배포·실제 통화 녹화까지 확인 완료

담당자 부재 중 이 문서만으로 운영이 가능하도록 작성했다. 순서대로 읽지 않아도 되며,
장애가 났으면 바로 [7. 장애 대응](#7-장애-대응-런북)으로 가면 된다.

---

## 1. 시스템 개요

| 항목 | 값 |
|---|---|
| 운영 서버 | `ubuntu@i15e106.p.ssafy.io` — AWS Lightsail, **4 vCPU / 15GB RAM / 309GB** |
| 서비스 URL | `https://i15e106.p.ssafy.io` |
| 저장소 경로 | `/home/ubuntu/docker/project/S15P11E106` |
| 환경변수 원본 | `/home/ubuntu/docker/project/.env` — **유일한 원본** (`infra/prod/.env`는 심볼릭 링크) |
| compose 프로젝트명 | `project` — 모든 compose 명령에 `-p project` 필수. 빼면 별개 스택으로 인식된다 |

### 컨테이너 구성

```
nginx(80/443) ─┬─ frontend        React 정적 서빙
               ├─ backend:8080    Spring Boot
               ├─ livekit:7880    영상통화 SFU (RTC 7881/tcp, 7882/udp 직결)
               └─ portainer:9000
livekit-egress                    서버 녹화 worker (profile: egress)
ai-agent                          STT·번역 (google-credentials.json 필요)
mysql:3307(로컬만)  redis  jenkins:8080
```

모든 컨테이너는 한국시간(KST)이다. 단 **livekit·portainer는 TZ 환경변수가 아니라
`/etc/localtime` 마운트 방식**이다 — 이미지에 tzdata가 없어 TZ를 넣으면 오히려 UTC로
고정된다(실측). compose에 주석이 있으니 지우지 말 것.

---

## 2. 접근 권한 — 문서와 별도로 전달받아야 하는 것

이 저장소에 없는 것들이다. 전임자에게 직접 받는다.

| 항목 | 용도 | 비고 |
|---|---|---|
| SSH pem 키 | 서버 접속 | 이것 없이는 아무것도 못 한다 |
| Jenkins 관리자 계정 | `:8080` 빌드 확인·재실행 | |
| Portainer 계정 | 웹으로 컨테이너 로그·재시작 | SSH 대체 수단 |
| `.env` 사본 위치 | 서버 유실 대비 | 팀 비밀 채널에 보관. 채팅·문서에 붙여넣지 말 것 |
| `google-credentials.json` 출처 | GCP 서비스 계정 재발급 | 서버 `/home/ubuntu/docker/project/secrets/`에만 존재 |
| DeepL·GMS·LangSmith 발급 계정 | 키 재발급·한도 확인 | 키 값은 `.env`에 있으나 콘솔은 발급 계정으로만 |

### ⚠️ Jenkins의 GIT_TOKEN은 전임자 개인 토큰이다

배포 파이프라인이 `notteck3661` 개인 GitLab 액세스 토큰으로 저장소를 받는다.
이 토큰이 만료되면 **모든 배포가 끊긴다.** 인수 직후 본인 토큰을 발급해
Jenkins credential(`GIT_TOKEN`)을 교체해 둘 것.

---

## 3. 배포 파이프라인

`lab` 브랜치 push → Jenkins 자동 트리거 → `infra/prod/scripts/deploy.sh`

deploy.sh가 순서대로 하는 일과, 각 단계에서 멈췄을 때의 의미:

| 단계 | 멈추면 |
|---|---|
| ① `RECORDING_EGRESS_ENABLED=true` 검사 | false면 배포 거부. **정상 동작** — 브라우저 녹화로 돌아간 이미지를 만들지 않기 위한 가드다. `.env`를 확인하라 |
| ② 진행 중 녹화(Redis 슬롯) 검사 | "진행 중인 Egress 녹화가 N건" → **장애 아님.** 녹화는 최대 10분이므로 기다렸다 재시도 |
| ③ google-credentials.json 확인 | 없으면 ai-agent만 배포 제외하고 계속 진행 (경고 출력) |
| ④ compose config 검증 | `.env` 필수 변수 누락 — 4번 체크리스트 대조 |
| ⑤ build → up (egress 포함) | 빌드 실패면 코드 문제. Jenkins 콘솔에서 컴파일 오류 확인 |
| ⑥ egress 쓰기 권한 검사 | 화면에 나오는 mkdir/chown 명령을 그대로 실행 |
| ⑦ nginx -t + reload | upstream IP 재해석. 이게 없으면 backend 교체 후 502가 난다 |

배포 중 backend 교체 순간 **약 25초 502**는 정상이다. 그 이상 지속되면 7번 런북.

---

## 4. `.env` 필수 변수 체크리스트

값은 서버에서만 확인한다. 변수 존재 여부 확인: `grep -c "^변수명=" /home/ubuntu/docker/project/.env`

```
DB_HOST DB_PORT DB_NAME DB_USERNAME DB_PASSWORD MYSQL_ROOT_PASSWORD
JWT_SECRET JWT_ACCESS_EXPIRATION JWT_REFRESH_EXPIRATION
LOGIN_MAX_FAILURES LOGIN_BLOCK_DURATION
REDIS_HOST REDIS_PORT
SPRING_PROFILES_ACTIVE CORS_ALLOWED_ORIGINS
LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET LIVEKIT_TEST_TOKEN_ENABLED
RECORDING_STORAGE_ROOT=/srv/melly/uploads     ← 스크립트가 이 파일을 직접 읽는다.
                                                 compose 기본값을 믿고 빼면 egress-ops 전부 실패
RECORDING_RETENTION_DAYS=7
RECORDING_EGRESS_ENABLED=true                 ← 절대 false 로 바꾸지 말 것 (10번)
RECORDING_EGRESS_OUTPUT_ROOT=/out
RECORDING_EGRESS_LAYOUT=grid
RECORDING_EGRESS_MAX_CONCURRENT=1             ← 절대 올리지 말 것 (5번)
RECORDING_EGRESS_CAPACITY_LEASE_SECONDS=7200
RECORDING_EGRESS_RECOVERY_CHECK_DELAY_MS=30000
RECORDING_EGRESS_RECOVERY_STALE_SECONDS=60
RECORDING_EGRESS_RECOVERY_BATCH_SIZE=20
ATTACHMENT_STORAGE_ROOT=/srv/melly/attachments
DEEPL_API_KEY GMS_API_KEY GOOGLE_APPLICATION_CREDENTIALS
LANGSMITH_TRACING LANGSMITH_ENDPOINT LANGSMITH_API_KEY LANGSMITH_PROJECT
COMPOSE_PROJECT_NAME=project
```

---

## 5. 녹화(Egress) 운영

**2026-08-04부터 서버 Egress가 유일한 녹화 방식이다.** 팬 통화가 시작되면 backend가
LiveKit에 녹화를 요청하고, egress worker(headless Chrome)가 방에 몰래 참가해 화면을
합성한 MP4를 `/srv/melly/uploads/egress/yyyy/MM/dd/`에 저장한다.
상태는 `STARTING → RECORDING → PROCESSING → AVAILABLE / FAILED`로 흐르고 웹훅으로
backend에 전달된다. 사용자에게는 `failureCode`만 노출된다(내부 메시지 비노출).

### 운영 명령 (`infra/prod/scripts/`)

```bash
bash egress-ops.sh status        # worker 상태 + 진행 중 슬롯 + 디스크
bash egress-ops.sh logs          # 최근 15분 egress/backend/livekit 에러 추출
bash egress-ops.sh start-worker  # worker 기동 (재부팅 복구용. 플래그 무관)
bash egress-ops.sh stop-worker   # 슬롯이 빌 때만 중지된다
```

### 지켜야 할 제약

- **동시 녹화 1건** (`MAX_CONCURRENT=1`). 실측: Egress 1건 = 평균 1.8코어, 최대 2.75코어.
  4 vCPU 서버라 2건이면 backend·mysql이 굶는다. 컨테이너에 `cpus: 3.0` 제한이 걸려 있다
- **녹화 1건 최대 10분** (`file_output_max_duration: 10m`, compose의 EGRESS_CONFIG_BODY).
  통화 시간 설정이 10분을 넘는 팬미팅이 생기면 녹화가 잘린다 — 9번 미해결 항목
- **worker는 uid 1001(non-root).** `/srv/melly/uploads/egress`가 1001 소유가 아니면
  녹화가 끝까지 진행된 뒤 저장에서 `permission denied`(LIVEKIT_400)로 실패한다.
  start-worker·activate·deploy가 자동 검사하고 정확한 복구 명령을 출력한다

### 정상 판정 기준

```bash
bash egress-ops.sh status
# worker_health=healthy active_capacity_slots=0   ← 통화 없을 때
ls -lh /srv/melly/uploads/egress/$(date +%Y/%m/%d)/   # 통화 후 *.mp4 크기 > 0
```

---

## 6. 함정 사전 (전부 실제로 겪은 것)

| 함정 | 증상 | 대응 |
|---|---|---|
| nginx upstream IP 캐싱 | 컨테이너 교체 후 전체 502 | deploy.sh가 reload로 자동 처리. 수동: `docker exec nginx nginx -s reload` |
| `nginx.conf`만 수정하고 배포 | 조용히 미적용 | nginx는 시작·reload 때만 설정을 읽는다. deploy.sh를 거치면 자동 reload |
| LiveKit YAML의 `${VAR}` | 치환 안 되고 문자열 그대로 | LiveKit 설정에 env 치환 없음. 키는 `LIVEKIT_KEYS` 환경변수로만 |
| livekit·portainer에 TZ 추가 | **오히려 UTC로 고정** | tzdata 없는 이미지. `/etc/localtime` 마운트 유지 |
| mysql `command:`/env 변경 | 배포 시 mysql 재생성 → 짧은 DB 중단 | 데이터는 bind mount라 안전. 트래픽 적은 시간에 배포 |
| 운영 스크립트의 `.env` 직접 파싱 | compose 기본값 있어도 변수 없으면 실패 | 4번 체크리스트의 변수를 지우지 말 것 |
| nginx 업로드 한도 | 한도는 파일이 아니라 multipart 요청 전체 | 녹화 2049m, 첨부 11m — 정확히 N MB 파일이 통과하도록 여유분 포함. 줄이지 말 것 |
| `docker compose`에 `-p project` 누락 | 기존 스택을 못 보고 새로 만들려 함 | 항상 `-p project --env-file /home/ubuntu/docker/project/.env` |

---

## 7. 장애 대응 런북

### 전체 502
```bash
docker exec nginx nginx -t && docker exec nginx nginx -s reload
# 원인: 컨테이너 IP 변경을 nginx가 모름. reload면 무중단 복구
```

### 녹화 실패 (사용자 화면에 "서버 녹화에 실패했습니다")
```bash
bash egress-ops.sh logs                        # "egress_failed" 줄의 error 필드가 원인
docker logs livekit-egress --tail 100
# permission denied → 화면의 chown 명령 실행
# 슬롯이 안 비어 다음 녹화가 안 시작 → redis-cli --scan --pattern 'recording:egress:capacity:*'
```

### worker 죽음 / 서버 재부팅 후
```bash
bash egress-ops.sh start-worker    # 배포를 다시 돌려도 동일하게 복구된다
```

### 배포가 계속 실패
```bash
# Jenkins 콘솔 로그 확인. deploy.sh 메시지별 의미는 3번 표 참고
# 수동 배포:
cd /home/ubuntu/docker/project/S15P11E106 && git pull origin lab
bash ./infra/prod/scripts/deploy.sh
```

### 통화 자체가 안 됨 (영상·음성 안 나옴)
```bash
docker logs livekit --tail 50
# 7881/tcp, 7882/udp 가 서버 방화벽(Lightsail 네트워킹)에 열려 있는지 확인
# webhook 이 backend 에 도달하는지: docker logs livekit | grep webhook
```

### 최후의 수단 — 브라우저 녹화 롤백 (팀 결정 위반. 정말 긴급할 때만)
```bash
# .env 에서 RECORDING_EGRESS_ENABLED=false 로 변경 후
bash egress-ops.sh rollback
# ※ 이 상태에서는 deploy.sh 가 모든 배포를 거부한다. 복구되면 반드시 true 로 되돌릴 것
```

---

## 8. 정기 확인 (주 1회면 충분)

```bash
df -h /srv/melly/uploads                  # 녹화 디스크. 만료 스케줄러가 7일 지난 파일을 지운다
sudo certbot certificates                 # SSL 만료일. 갱신 방식은 미확인 — 9번 참고
docker ps --format 'table {{.Names}}\t{{.Status}}'   # 전부 Up 인지
```

---

## 9. 미해결 항목 (부재 중 판단이 필요할 수 있는 것)

1. **통화 시간 vs 10분 녹화 제한** — 팬미팅 통화 시간(`callDurationSec`) 최대 설정이
   10분을 넘으면 녹화가 잘린다. 기획 확인 후 필요 시 compose의
   `file_output_max_duration` 상향 (egress 재생성 필요, 통화 없는 시간에)
2. **`LIVEKIT_TEST_TOKEN_ENABLED=true`** — 운영에 테스트 토큰 엔드포인트가 열려 있다.
   `false`로 바꾸고 배포해야 한다 (보안). 바꾸면 테스트 페이지가 동작을 멈추니 팀 공지 후 진행
3. **`be/main`·`be/dev` 빌드 깨짐** — `FanMeetingTestControlRequest` 누락(`1ea7fc1`).
   `lab`에는 복구됨(`f912e09`). 두 브랜치는 직접 push 금지라 담당자 처리 또는 MR 필요
4. **SSL 자동 갱신 여부 미확인** — compose에 certbot 컨테이너가 없다.
   `sudo crontab -l`로 갱신 크론이 있는지 확인하고, 없으면 만료 전 수동 갱신 필요
5. **시크릿 로테이션 권장** — `.env` 전문이 AI 채팅에 노출된 적 있다 (JWT_SECRET,
   LIVEKIT_API_SECRET 등). 여유 될 때 로테이션
6. 백업·디스크 알람 없음 — 단일 서버 로컬 디스크 구조. 알람은 없으니 8번 정기 확인으로 대체

---

## 10. 절대 하지 말 것

- `RECORDING_EGRESS_ENABLED=false` 로 배포 시도 — 브라우저 녹화로 회귀 금지 (팀 결정).
  deploy.sh가 막지만, 우회하지 말 것
- `RECORDING_EGRESS_MAX_CONCURRENT` 을 1보다 크게 — 4 vCPU에서 서비스 전체가 느려진다
- `git push --force` (모든 브랜치), `be/dev`·`be/main`·`master` 직접 push
- `FLUSHALL`, `DROP DATABASE`, `TRUNCATE` — redis db 1은 LiveKit이 실시간으로 쓴다
- `.env` 값을 채팅·문서·커밋에 붙여넣기
- livekit·portainer 서비스에 `TZ` 환경변수 추가 (6번 함정)
- `docker compose down` — 전체 중단이다. 개별 서비스만 `up -d <서비스>`로 다룰 것
