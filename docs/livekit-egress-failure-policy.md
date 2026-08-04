# LiveKit Egress 실패·재시도·동시성 정책

## 기본 원칙

- 녹화 실패는 통화, 대기열 전환, 다음 팬 입장을 실패시키지 않는다.
- 같은 통화의 녹화를 새 Egress로 자동 재시작하지 않는다. 시작 응답 유실 상황에서 무조건
  재시작하면 동일 통화를 중복 녹화할 수 있기 때문이다.
- 이미 존재하는 Egress 작업의 조회와 중지 요청은 주기적으로 재시도한다.
- 운영 기본 동시 작업 수는 1건이다.

## 동시성 제한

backend는 `recording:egress:capacity:{slot}` Redis 키에 recording ID를 저장한다. 슬롯 확보는
TTL이 포함된 `SET NX`로 수행하고, 갱신과 해제는 현재 소유자가 같은 경우에만 실행하는 Lua
스크립트를 사용한다. 기본 임대 시간은 7,200초이며 복구 작업이 실행될 때 갱신된다.

슬롯이 없으면 해당 녹화만 `FAILED / EGRESS_CONCURRENCY_LIMIT`로 전환한다. Redis가
응답하지 않으면 안전하게 실패하는 `EGRESS_CAPACITY_GUARD_UNAVAILABLE`을 기록하며 Egress
시작 API를 호출하지 않는다.

## 30초 복구 주기와 60초 정체 기준

`STARTING`, `RECORDING`, `PROCESSING` 상태가 60초 이상 갱신되지 않으면 한 번에 최대
20건을 조회한다.

| 상황 | 복구 동작 |
| --- | --- |
| Egress ID가 DB에 있음 | ID로 LiveKit 작업을 조회해 상태를 다시 반영 |
| 시작 API는 성공했으나 DB 반영 전 장애 | room의 최근 Egress를 찾아 ID와 상태 연결 |
| 종료 API 응답 또는 종료 웹훅 유실 | LiveKit 작업이 실행 중이면 stop을 다시 호출 |
| 완료 웹훅 유실 | 조회된 COMPLETE와 실제 파일을 검증해 AVAILABLE 처리 |
| LiveKit에 작업이 없음 | `FAILED / EGRESS_RECOVERY_NOT_FOUND` 처리 |
| 조회 API 일시 장애 | 현재 상태를 유지하고 다음 주기에 재시도 |
| 임대 슬롯이 다른 녹화 소유 | 복구된 중복 작업을 중지해 동시성 한도로 복귀 |

## 웹훅 멱등성

모든 상태 변경은 recording 행의 비관적 잠금 안에서 수행한다. 완료·실패 이후 도착한
`EGRESS_ACTIVE`, 중복 `EGRESS_COMPLETE`, 늦은 실패 이벤트는 재생 가능한 녹화를 이전
상태로 되돌리지 않는다. 용량 슬롯은 DB 상태 변경 트랜잭션이 커밋된 뒤에만 해제한다.

## 테스트 범위

- 동시 슬롯 확보 성공·거부와 소유자 비교 해제
- 동시 작업 한도 도달 시 Egress 시작 API 미호출
- 시작 API 거부가 녹화 실패로만 저장됨
- 통화 종료가 시작 응답보다 먼저 발생한 경우 즉시 stop
- 종료 응답·웹훅 유실 후 stop 재시도
- room 조회를 통한 유실된 시작 응답 복구
- LiveKit에서 작업을 찾지 못한 정체 행 실패 처리
- 다른 녹화가 슬롯을 가진 상태에서 발견된 중복 작업 중지
- Egress 완료 파일 경로·존재·크기 검증

