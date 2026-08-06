# LiveKit Egress 백엔드 모델 설계

## 목표

기존 브라우저 업로드 녹화와 조회·다운로드·7일 만료 정책을 유지하면서, 통화 세션별
LiveKit Egress 작업을 시작부터 파일 제공까지 멱등하게 추적한다. 이 문서는 현재 구현된
데이터 모델, 상태 전이, LiveKit API·webhook 연동과 복구 정책을 함께 설명한다.

## 현재 구조에서 재사용할 부분

- `Recording`과 `CallSession`은 이미 일대일이며 `call_session_id`에 unique 제약이 있다.
- `Recording`에는 파일 이름, MIME 타입, 상대 저장 키, 크기, 길이, 상태, 완료·만료 시각과
  재시도 횟수가 있다.
- 조회·다운로드 권한은 해당 `CallSession`에 참여한 팬 본인으로 제한되어 있다.
- `AVAILABLE` 녹화는 완료 시점부터 7일 뒤 만료되고 파일도 삭제된다.
- 팬미팅 운영 설정에는 `recordingEnabled`, 참가자에는 `recordingConsentAt`이 있다.
- LiveKit Room은 팬미팅 동안 호스트가 머무는 공유 Room이며, 팬별 `CallSession`이 순차적으로
  같은 Room을 사용한다.

따라서 PoC에서는 별도 Egress 작업 테이블을 추가하지 않고 기존 `recordings`를 확장한다.
통화당 녹화 결과가 한 개라는 현재 정책과도 맞고 기존 조회 API를 그대로 활용할 수 있다.
여러 번의 자동 재시도 이력이나 다중 Egress worker 감사 로그가 필요해지면 그때
`recording_egress_attempts` 테이블을 분리한다.

## `recordings` 확장안

기존 파일 관련 컬럼은 유지한다. Egress는 시작 전에 최종 상대 경로와 MP4 파일명을 미리
만들 수 있으므로 `file_name`, `content_type`, `storage_key`도 현재처럼 NOT NULL을 유지한다.

| 컬럼 | 타입·제약 | 용도 |
| --- | --- | --- |
| `source` | `VARCHAR(30) NOT NULL` | `BROWSER_UPLOAD` 또는 `LIVEKIT_EGRESS` |
| `egress_id` | `VARCHAR(128) NULL UNIQUE` | LiveKit이 반환한 Egress 작업 ID |
| `room_name` | `VARCHAR(255) NULL` | 시작 시점의 LiveKit Room 이름 스냅샷 |
| `requested_at` | `DATETIME(6) NULL` | 백엔드가 Egress 시작을 요청하기로 확정한 시각 |
| `egress_started_at` | `DATETIME(6) NULL` | Egress가 실제 녹화를 시작한 시각 |
| `egress_ended_at` | `DATETIME(6) NULL` | Egress 작업이 완료 또는 실패한 시각 |
| `failure_code` | `VARCHAR(100) NULL` | SDK·LiveKit·내부 검증 실패를 구분하는 안정적인 코드 |
| `failure_message` | `VARCHAR(1000) NULL` | 운영 진단용 실패 설명. 사용자 응답에는 직접 노출하지 않음 |

추가 인덱스:

- `uk_recordings_egress_id (egress_id)`: 중복 작업 연결 방지
- `idx_recordings_status_updated_at (status, updated_at)`: 멈춘 작업 복구 조회

기존 행은 `source=BROWSER_UPLOAD`로 backfill한다. 새 Egress 녹화는 다음 값을 미리 채운다.

- `file_name`: `call-{callSessionId}.mp4`
- `content_type`: `video/mp4`
- `storage_key`: `egress/yyyy/MM/dd/{callSessionId}-{uuid}.mp4`
- Egress 컨테이너 출력 경로: `/out/{storageKey}`

운영 Egress에는 백엔드와 같은 `/srv/melly/uploads`를 `/out`으로 마운트한다. DB에는 절대
호스트 경로나 `/out`을 저장하지 않고 기존 `RecordingFileStorage`가 처리할 상대 키만 저장한다.

## 상태 모델

`RecordingStatus`에 `STARTING`을 추가하고 기존 값을 유지한다.

| 현재 상태 | 이벤트 | 다음 상태 | 처리 |
| --- | --- | --- | --- |
| 없음 | 양측 입장·녹화 설정·동의 확인 | `STARTING` | 저장 키를 선점하고 DB 행을 먼저 생성 |
| `STARTING` | 시작 응답의 `EGRESS_STARTING` | `STARTING` | `egressId`를 저장하고 실제 시작 이벤트 대기 |
| `STARTING` | `egress_started`의 `EGRESS_ACTIVE` | `RECORDING` | 실제 시작 시각 저장 |
| `STARTING` | 시작 거부·타임아웃 확정 | `FAILED` | 실패 코드와 메시지 저장, 통화는 유지 |
| `RECORDING` | `CallSession` 종료 또는 `egress_updated`의 `EGRESS_ENDING` | `PROCESSING` | 해당 `egressId` 중지 요청, MP4 마감 대기 |
| `PROCESSING` | `egress_ended`의 `EGRESS_COMPLETE` 및 파일 검증 성공 | `AVAILABLE` | 크기·길이·완료 시각과 7일 만료 시각 저장 |
| 비종결 상태 | `egress_ended`의 `EGRESS_FAILED`, `EGRESS_ABORTED`, `EGRESS_LIMIT_REACHED` 또는 파일 검증 실패 | `FAILED` | 실패 정보 저장, 통화 종료 처리는 그대로 진행 |
| `AVAILABLE` | 보관 기간 만료 | `EXPIRED` | 기존 스케줄러가 파일 삭제 |
| `AVAILABLE` | 운영자 삭제 | `DELETED` | 기존 수동 삭제 정책에 사용 |

상태는 역행하지 않는다. 같은 webhook을 다시 받아도 현재 값과 같거나 더 뒤의 상태라면
성공으로 간주하고 아무것도 바꾸지 않는다. `AVAILABLE`, `FAILED`, `EXPIRED`, `DELETED`에
도착한 작업은 늦게 온 `egress_started` 이벤트로 되돌리지 않는다.

LiveKit이 보내는 Egress webhook 이름은 `egress_started`, `egress_updated`, `egress_ended`
세 가지이며 성공·실패 여부는 이벤트 이름이 아니라 payload의 `EgressInfo.status`로 판정한다.
상태 매핑은 LiveKit 공식 [webhook 이벤트 문서](https://docs.livekit.io/intro/basics/rooms-participants-tracks/webhooks-events/)와
[Egress API 타입 문서](https://docs.livekit.io/reference/other/egress/api/)를 기준으로 한다.

## 시작 조건과 통화 생명주기

최초 `CONNECTING -> ACTIVE` 전환 직후 다음 조건이 모두 참일 때만 Egress 녹화를 준비한다.

1. 팬미팅의 `MeetingOperationSetting.recordingEnabled`가 `true`
2. 현재 팬의 `Participant.recordingConsentAt`이 존재
3. 해당 `CallSession`에 `Recording` 행이 없음
4. `CallSession`이 실제 `ACTIVE` 상태

`recordingEnabled`는 운영자 측 녹화 의사, `recordingConsentAt`은 팬의 동의로 사용한다.
팬은 통화 입장 전에 동의 API를 호출하며, 이미 동의한 통화에서는 재호출해도 같은 동의
시각을 반환한다.

Room은 팬미팅 전체에서 공유되므로 `room_finished`를 녹화 종료 기준으로 사용하면 안 된다.
정상 종료, 시간 초과, 팬·인플루언서 이탈, 운영자 강제 종료 등 모든 경로가 모이는
`CallSessionFinalizer.end`에서 현재 세션의 `egressId`만 중지 대상으로 전달한다. 녹화 중지
실패가 통화·대기열 종료 트랜잭션을 롤백해서는 안 된다.

## 트랜잭션과 멱등성

- `CallSession` 활성화와 `STARTING` 녹화 행 생성은 같은 DB 트랜잭션에서 처리한다.
- 외부 LiveKit API 호출은 DB 커밋 뒤에 실행한다. 외부 호출을 DB 트랜잭션 안에서 기다리지
  않는다.
- 상태 변경은 `call_session_id` 또는 `egress_id`로 녹화 행을 쓰기 잠금 조회한 뒤 수행한다.
- 기존 webhook `eventId` 선점 로직을 Egress 이벤트에도 동일하게 적용한다.
- Egress 시작 응답이 유실되면 새 작업을 바로 만들지 않는다. `room_name`, `storage_key`,
  요청 시각으로 LiveKit의 활성 Egress 목록을 먼저 대조해 기존 작업을 연결한다.
- `STARTING`, `RECORDING`, `PROCESSING` 상태가 일정 시간 이상 갱신되지 않으면 복구
  스케줄러가 Egress 상태와 파일 존재 여부를 다시 조회한다.
- 자동 재시도는 첫 연동에서 활성화하지 않는다. 이후 허용할 경우 `retry_count`를 증가시키고
  최대 횟수와 backoff를 설정한 뒤 재시도한다.

현재 Egress worker의 CPU 비용 설정이 동시 Room Composite 1건만 받아들이므로 두 번째 요청은
거부될 수 있다. 백엔드는 이를 통화 장애가 아닌 해당 녹화의 `FAILED`로만 기록한다.

## 파일 완료와 사용자 API

`egress_ended`의 상태가 `EGRESS_COMPLETE`라는 사실만으로 `AVAILABLE` 처리하지 않는다.
다음 검증을 모두 통과해야 한다.

1. `storage_key`가 녹화 저장 루트 아래의 안전한 상대 경로
2. 파일이 존재하고 일반 파일
3. 파일 크기가 0보다 큼
4. Egress 결과의 출력 경로가 사전에 저장한 경로와 일치

통과하면 `fileSizeBytes`, `durationSec`, `completedAt`, `availableUntil`을 채운다.
`availableUntil`은 `completedAt + retentionDays`로 계산한다.

기존 상세·목록 응답의 `status`와 `playable`은 그대로 사용한다. 후속 UI에서 출처와 진행
상태를 구분할 수 있도록 `source`, `egressStartedAt`을 응답에 추가한다. 내부 `egressId`,
`storageKey`, `failureMessage`는 사용자 API에 노출하지 않는다. `FAILED`일 때는 안정적인 사용자용
오류 코드만 별도 매핑한다.

## 브라우저 녹화와의 호환성

- 기존 `Recording.createAvailable`은 `source=BROWSER_UPLOAD`로 동작한다.
- 기존 행은 모두 브라우저 녹화로 간주한다.
- Egress 검증이 끝날 때까지 업로드 API는 제거하지 않는다.
- 같은 통화에서 두 방식을 동시에 실행하지 않고 설정값으로 `BROWSER` 또는 `EGRESS` 중 하나만
  선택한다. 따라서 기존 통화당 1개 unique 제약을 유지한다.
- Egress가 `FAILED`인 통화에 브라우저 파일을 덮어쓰는 fallback은 첫 연동 범위에서 제외한다.

## 구현 상태

- 기존 `Recording`에 Egress 출처·상태·작업 ID·Room·시각·실패 정보 필드 추가
- `POST /api/v1/call-sessions/{callSessionId}/recordings/consent` 동의 API 추가
- LiveKit Java SDK의 720p/30fps MP4 Room Composite 시작 및 `egressId` 중지 호출 추가
- 통화 `ACTIVE` 전환 시 조건부 시작, 모든 활성 통화 종료 경로에서 해당 Egress 중지
- `egress_started`, `egress_updated`, `egress_ended` webhook 상태 반영
- DB 커밋 후 외부 API 호출 및 응답 저장용 `REQUIRES_NEW` 트랜잭션 경계
- 중복·역순 상태 전이와 시작 응답 전 통화 종료 경합 처리
- 완료 파일의 경로·존재·크기 검증 후 `AVAILABLE` 전환 및 7일 보관 정책 연결
- 백엔드 재시작 시 `egressId` 또는 요청 출력 경로로 기존 작업을 복구
- 운영 기능 플래그 `RECORDING_EGRESS_ENABLED` 추가, 기본값 `false`

운영 DB의 신규 컬럼은 현재 프로젝트 정책대로 Hibernate `ddl-auto=update`가 적용한다.
기능 플래그는 기본적으로 꺼져 있으며, 운영 전환은 Egress worker 상태와 저장 경로를 먼저
검증한 뒤 runbook의 단계적 활성화 절차로 수행한다.
