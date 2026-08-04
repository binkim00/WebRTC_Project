# LiveKit Egress 운영 전환·모니터링·롤백 Runbook

## 현재 배포 상태

Egress는 `docker-compose.prod.yml`의 `egress` profile에 들어 있다. 기존 `deploy.sh`는 이
profile을 시작하지 않으며 `RECORDING_EGRESS_ENABLED=true`인 일반 배포도 차단한다. 따라서
코드를 배포해도 명시적인 운영 전환 전에는 기존 브라우저 녹화가 유지된다.

운영 전환은 `infra/prod/scripts/egress-ops.sh`만 사용한다. 이 스크립트는 환경 파일을 직접
수정하지 않으며, 작업자가 설정한 모드와 실제 worker 상태를 검증한 뒤 각 단계를 실행한다.

## 사전 조건

- 서버는 4 vCPU이므로 `RECORDING_EGRESS_MAX_CONCURRENT=1`을 유지한다.
- `RECORDING_STORAGE_ROOT=/srv/melly/uploads`
- `RECORDING_EGRESS_OUTPUT_ROOT=/out`
- `/srv/melly/uploads`는 backend와 Egress 컨테이너 모두 쓰기 가능해야 한다.
- LiveKit과 Egress는 같은 Redis 주소와 DB 1, 같은 API key/secret을 사용한다.
- 최초 worker 기동 시에는 반드시 `RECORDING_EGRESS_ENABLED=false`여야 한다.

```bash
cd /home/ubuntu/docker/project/S15P11E106
bash ./infra/prod/scripts/egress-ops.sh validate
bash ./infra/prod/scripts/check-egress-capacity.sh
```

## 단계적 활성화

### 1. 기능이 꺼진 상태로 코드 배포

루트 환경 파일에서 다음 값을 유지한다.

```dotenv
RECORDING_EGRESS_ENABLED=false
RECORDING_EGRESS_MAX_CONCURRENT=1
```

기존 `deploy.sh`로 backend와 frontend를 배포한다. 이때 frontend는 브라우저 녹화 모드로
빌드된다.

### 2. worker만 기동

```bash
bash ./infra/prod/scripts/egress-ops.sh start-worker
bash ./infra/prod/scripts/egress-ops.sh status
```

worker가 `healthy`인지, backend·LiveKit·Redis 상태가 정상인지 확인한다. 이 단계에서는
backend가 Egress 시작 요청을 보내지 않는다.

### 3. 한 건 활성화

팀이 정한 테스트 시간에 루트 환경 파일의 값을 `true`로 바꾼 뒤 실행한다.

```bash
bash ./infra/prod/scripts/egress-ops.sh activate
```

이 명령은 worker가 이미 healthy인지 확인하고 backend와 frontend를 같은 `true` 값으로 다시
빌드한다. 이후 테스트 팬미팅 한 건만 진행한다.

확인 순서:

1. 팬 입장 전에 녹화 동의 화면이 표시된다.
2. 통화 중 UI에 `서버 Egress` 녹화가 표시된다.
3. 두 번째 동시 녹화가 시작되지 않는다.
4. 종료 뒤 STARTING/RECORDING/PROCESSING을 거쳐 AVAILABLE이 된다.
5. `/srv/melly/uploads/egress/yyyy/MM/dd/*.mp4` 파일이 0 byte보다 크다.
6. 다시보기 재생과 Range 탐색, 다운로드가 동작한다.
7. 녹화 실패가 통화 종료와 다음 팬 입장을 막지 않는다.

## 모니터링

```bash
bash ./infra/prod/scripts/egress-ops.sh status
bash ./infra/prod/scripts/egress-ops.sh logs
```

worker의 8081 health 포트와 9090 Prometheus 포트는 Docker 내부 네트워크에만 노출된다.
현재 수집기가 없으므로 `status`는 컨테이너 health, `docker stats`, Redis 용량 슬롯, 저장소
사용량을 한 번에 보여 준다. Prometheus 도입 시 `egress:9090/metrics`를 내부 scrape target으로
추가한다.

즉시 비활성화 기준:

- 호스트 CPU가 1분 이상 75%를 넘거나 load average가 3 이상 지속
- Egress가 약 2.8 CPU 코어에 계속 근접하거나 메모리가 3.2 GiB를 초과
- LiveKit 패킷 손실, 통화 끊김, 다음 팬 입장 지연 발생
- `EGRESS_CONCURRENCY_LIMIT` 외 실패가 반복되거나 PROCESSING이 복구 기준을 지나 계속 남음
- 저장소 여유가 30 GiB 미만이거나 전체의 15% 미만
- worker health가 unhealthy

## 롤백

먼저 루트 환경 파일을 다음처럼 되돌린다.

```dotenv
RECORDING_EGRESS_ENABLED=false
```

그다음 실행한다.

```bash
bash ./infra/prod/scripts/egress-ops.sh rollback
```

스크립트는 backend와 frontend를 브라우저 녹화 모드로 다시 빌드·기동하고 nginx 설정을
검증해 reload한다. 진행 중인 용량 슬롯이 0이 된 뒤에만 worker를 중지한다. 슬롯이 남아
있으면 worker를 강제 종료하지 않고 실패하므로 현재 통화 종료와 로그를 먼저 확인한다.

이 롤백은 스키마나 기존 녹화 행을 되돌리지 않는다. 이미 AVAILABLE인 Egress MP4는 기존
보존·재생 정책에 따라 계속 사용할 수 있고, 새 통화만 브라우저 녹화로 돌아간다.

## Chrome sandbox 후속 조치

현재 worker는 검증된 PoC와 동일하게 Chrome sandbox가 비활성화돼 있다. LiveKit 공식 Egress
문서는 sandbox 활성화 시 별도 seccomp profile로 `clone`, `unshare` 호출을 허용하도록 안내한다.
불특정 URL을 받는 Web Egress는 사용하지 않고 Room Composite만 허용하며, 장기 운영 또는
worker 분리 서버 전환 전에는 사용 이미지 태그에 맞는 공식 seccomp profile을 고정·검증한다.

