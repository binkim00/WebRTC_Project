import { apiRequest } from './client'
import { unwrapEnvelope } from './envelope'

export type FanMeetingStatus =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'APPLICATION_OPEN'
  | 'APPLICATION_CLOSED'
  | 'READY'
  | 'LIVE'
  | 'ENDED'
  | 'CANCELED'

export type ApplicationSettingPatch = {
  enabled?: boolean
  startAt?: string
  endAt?: string
  resultAnnouncementAt?: string
  capacity?: number
}

export type OperationSettingPatch = {
  queueOpenAt?: string
  callDurationSec?: number
  recordingEnabled?: boolean
  translationEnabled?: boolean
  reconnectGraceSec?: number
  earlyStartMinutes?: number
  maxRecallCount?: number
}

export type FanMeetingUpdateRequest = {
  influencerId?: number
  title?: string
  description?: string
  coverImageUrl?: string
  scheduledStartAt?: string
  application?: ApplicationSettingPatch
  operation?: OperationSettingPatch
}

/**
 * 테스트용 강제 상태·일정 변경 요청이다.
 *
 * 일반 PATCH가 application/operation 객체로 감싸는 것과 달리 평평한 구조이며,
 * 필드 이름도 백엔드 엔티티 기준(applicationOpenAt, waitingRoomOpenAt)이라 서로 다르다.
 * 생략하거나 null로 보낸 값은 기존 설정을 그대로 유지한다.
 */
export type FanMeetingTestControlRequest = {
  status?: FanMeetingStatus | null
  scheduledStartAt?: string | null
  applicationOpenAt?: string | null
  applicationCloseAt?: string | null
  resultAnnouncementAt?: string | null
  waitingRoomOpenAt?: string | null
}

/** 운영 화면에서 노출하는 시간 우회 전환 대상이다. 임의 회귀 상태는 의도적으로 제외한다. */
export type ImmediateFanMeetingStatus =
  | 'APPLICATION_OPEN'
  | 'APPLICATION_CLOSED'
  | 'LIVE'

export type ImmediateTransitionContext = {
  applicationStartAt?: string | null
  applicationEndAt?: string | null
  /** 테스트에서 전환 시각을 고정할 때 사용한다. */
  now?: Date
}

/**
 * 현재 백엔드가 제공하는 강제 전환 API를 운영 UI에서 안전하게 제한하기 위한 순방향 표다.
 *
 * 이 검사는 실수 방지용이며 최종 권한·상태 검증은 반드시 서버가 수행해야 한다. 프론트에서는
 * 과거 상태 복원이나 종료 상태 재개 같은 위험한 조합을 요청할 수 없게 막는다.
 */
const IMMEDIATE_TRANSITIONS: Partial<
  Record<FanMeetingStatus, readonly ImmediateFanMeetingStatus[]>
> = {
  PUBLISHED: ['APPLICATION_OPEN'],
  APPLICATION_OPEN: ['APPLICATION_CLOSED'],
  READY: ['LIVE'],
}

export type FanMeetingApplicationSetting = {
  enabled: boolean
  startAt: string | null
  endAt: string | null
  resultAnnouncementAt: string | null
  capacity: number
}

export type FanMeetingOperationSetting = {
  queueOpenAt: string | null
  callDurationSec: number
  recordingEnabled: boolean
  translationEnabled: boolean
  reconnectGraceSec: number
  earlyStartMinutes: number
  maxRecallCount: number
}

export type FanMeetingManagementResponse = {
  meetingId: number
  status: FanMeetingStatus
  influencerId: number
  title: string
  description: string | null
  coverImageUrl: string | null
  scheduledStartAt: string | null
  publishedAt: string | null
  canceledAt: string | null
  actualStartAt: string | null
  actualEndAt: string | null
  deletedAt: string | null
  application: FanMeetingApplicationSetting
  operation: FanMeetingOperationSetting
}

export type FanMeetingStatisticsResponse = {
  applicationCount: number
  selectedCount: number
  participantCount: number
  completedCallCount: number
  noShowCount: number
  failedCallCount: number
  averageCallDurationSec: number
  totalMeetingDurationSec: number
}

function meetingPath(meetingId: string | number, suffix = ''): string {
  return `/api/v1/fan-meetings/${encodeURIComponent(String(meetingId))}${suffix}`
}

/**
 * 팬미팅 정보를 부분(PATCH) 수정한다.
 * 전체 본문을 보내는 managerOperations.updateFanMeeting(fe/dev 초안 저장용)과 구분하기 위해
 * patch 접두어를 사용한다.
 */
export async function patchFanMeeting(
  meetingId: string | number,
  patch: FanMeetingUpdateRequest,
  authToken: string,
  signal?: AbortSignal,
): Promise<FanMeetingManagementResponse> {
  const response = await apiRequest<unknown>(meetingPath(meetingId), {
    method: 'PATCH',
    authToken,
    signal,
    body: JSON.stringify(patch),
  })

  return unwrapEnvelope<FanMeetingManagementResponse>(response)
}

/**
 * 상태와 주요 일정을 검증 없이 강제로 바꾼다. (운영자·1인 인플루언서 전용)
 *
 * 정상 전환 규칙을 건너뛰는 테스트·시연 전용 경로이므로 일반 운영 흐름에서는 쓰지 않는다.
 */
export async function controlFanMeetingForTest(
  meetingId: string | number,
  request: FanMeetingTestControlRequest,
  authToken: string,
  signal?: AbortSignal,
): Promise<FanMeetingManagementResponse> {
  const response = await apiRequest<unknown>(meetingPath(meetingId, '/test-control'), {
    method: 'PATCH',
    authToken,
    signal,
    body: JSON.stringify(request),
  })

  return unwrapEnvelope<FanMeetingManagementResponse>(response)
}

/**
 * 예약 시각만 우회해 다음 운영 상태로 즉시 전환한다.
 *
 * 백엔드에 정식 transition 엔드포인트가 아직 없어 기존 `/test-control`을 제한적으로 사용한다.
 * 서버의 실제 기간 검증과 시작 기록을 만족시키기 위해 해당 예약 시각을 현재로 맞춘 뒤 순방향
 * 상태만 허용한다. 정식 명령 API가 추가되면 이 함수 내부만 교체하면 된다.
 */
function toServerLocalDateTime(date: Date): string {
  // KST는 일광 절약 시간이 없으므로 UTC에 9시간을 더해 offset 없는 서버 LocalDateTime을 만든다.
  return new Date(date.getTime() + 9 * 60 * 60_000).toISOString().slice(0, 23)
}

/**
 * 서버가 보낸 LocalDateTime 문자열을 밀리초로 바꾼다.
 *
 * offset이 없는 값은 서버 시간대(KST) 기준으로 해석한다. `new Date(value)`에 그대로 넘기면
 * 브라우저 시간대를 따라가므로 KST가 아닌 환경에서 오픈 시각 비교가 어긋난다.
 */
export function serverLocalDateTimeMs(value?: string | null): number {
  if (!value) return Number.NaN
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
  return new Date(hasOffset ? value : `${value}+09:00`).getTime()
}

/**
 * 대기실 오픈 시각이 이미 지났는지 확인한다.
 *
 * 백엔드 `QueueCommandService.enter()`와 같은 기준이다. 오픈 시각이 없으면 제한이 없다고 본다.
 *
 * @param queueOpenAt 운영 설정의 대기열 오픈 일시
 * @param now 비교 기준 시각이며 기본값은 현재다
 */
export function isWaitingRoomOpen(queueOpenAt?: string | null, now = Date.now()): boolean {
  if (!queueOpenAt) return true
  const openAt = serverLocalDateTimeMs(queueOpenAt)
  return Number.isFinite(openAt) && now >= openAt
}

export async function transitionFanMeetingImmediately(
  meetingId: string | number,
  currentStatus: FanMeetingStatus,
  targetStatus: ImmediateFanMeetingStatus,
  authToken: string,
  context: ImmediateTransitionContext = {},
  signal?: AbortSignal,
): Promise<FanMeetingManagementResponse> {
  const allowedTargets = IMMEDIATE_TRANSITIONS[currentStatus]
  if (!allowedTargets?.includes(targetStatus)) {
    throw new TypeError(
      `${currentStatus} 상태에서 ${targetStatus} 상태로 즉시 전환할 수 없습니다.`,
    )
  }

  const now = context.now ?? new Date()
  const nowValue = toServerLocalDateTime(now)

  if (targetStatus === 'APPLICATION_OPEN') {
    const originalStart = serverLocalDateTimeMs(context.applicationStartAt)
    const originalEnd = serverLocalDateTimeMs(context.applicationEndAt)
    const originalDuration = originalEnd - originalStart
    const closeAt = Number.isFinite(originalEnd) && originalEnd > now.getTime()
      ? undefined
      : toServerLocalDateTime(
          new Date(
            now.getTime() +
              (Number.isFinite(originalDuration) && originalDuration > 0
                ? originalDuration
                : 24 * 60 * 60_000),
          ),
        )

    // 응모 서비스가 상태와 기간을 모두 검사하므로 시작 시각도 현재로 옮긴다.
    return controlFanMeetingForTest(
      meetingId,
      {
        status: targetStatus,
        applicationOpenAt: nowValue,
        ...(closeAt ? { applicationCloseAt: closeAt } : {}),
      },
      authToken,
      signal,
    )
  }

  if (targetStatus === 'APPLICATION_CLOSED') {
    // 실제 마감 기록과 상태가 어긋나지 않도록 예약 마감 시각도 현재로 맞춘다.
    return controlFanMeetingForTest(
      meetingId,
      { status: targetStatus, applicationCloseAt: nowValue },
      authToken,
      signal,
    )
  }

  // LIVE 강제 지정은 actualStartAt을 기록하지 않으므로 시작 시각을 현재로 옮긴 뒤 정식 start 명령을 호출한다.
  await controlFanMeetingForTest(
    meetingId,
    // 즉시 시작 시 대기열 오픈도 현재 시각으로 맞춰야 참가자가 바로 입장할 수 있다.
    { scheduledStartAt: nowValue, waitingRoomOpenAt: nowValue },
    authToken,
    signal,
  )
  return startFanMeeting(meetingId, authToken, signal)
}

/** 팬미팅 시작 전에도 참가자가 대기실에서 장비를 점검할 수 있도록 대기열을 즉시 연다. */
export function openWaitingRoomImmediately(
  meetingId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<FanMeetingManagementResponse> {
  return controlFanMeetingForTest(
    meetingId,
    { waitingRoomOpenAt: toServerLocalDateTime(new Date()) },
    authToken,
    signal,
  )
}

/**
 * 대기실을 먼저 연 뒤 팬미팅을 시작한다.
 *
 * `POST /start`는 상태만 LIVE로 바꾸고 대기실 오픈 시각은 그대로 두는데, 시작 허용 시각은
 * `earlyStartMinutes`가, 입장 허용 시각은 `waitingRoomOpenAt`이 따로 결정한다. 두 기준이
 * 어긋나면 팬미팅이 진행 중인데도 팬은 `WAITING_ROOM_NOT_OPEN`으로 계속 막히므로 시작과
 * 동시에 오픈 시각을 현재로 당긴다.
 *
 * 오픈 요청이 실패해도 시작 자체는 막지 않는다. 실제 오픈 여부는 응답의
 * `operation.queueOpenAt`을 {@link isWaitingRoomOpen}으로 다시 확인해 호출자가 안내한다.
 */
export async function startFanMeetingWithOpenWaitingRoom(
  meetingId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<FanMeetingManagementResponse> {
  try {
    await openWaitingRoomImmediately(meetingId, authToken, signal)
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
  }
  return startFanMeeting(meetingId, authToken, signal)
}

async function postCommand(
  meetingId: string | number,
  command: string,
  authToken: string,
  signal?: AbortSignal,
): Promise<FanMeetingManagementResponse> {
  const response = await apiRequest<unknown>(meetingPath(meetingId, `/${command}`), {
    method: 'POST',
    authToken,
    signal,
  })

  return unwrapEnvelope<FanMeetingManagementResponse>(response)
}

/** 팬미팅을 취소한다. (발행은 managerOperations.publishFanMeeting 사용) */
export function cancelFanMeeting(
  meetingId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<FanMeetingManagementResponse> {
  return postCommand(meetingId, 'cancel', authToken, signal)
}

/** 팬미팅을 시작한다. */
export function startFanMeeting(
  meetingId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<FanMeetingManagementResponse> {
  return postCommand(meetingId, 'start', authToken, signal)
}

/** 팬미팅을 종료한다. */
export function endFanMeeting(
  meetingId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<FanMeetingManagementResponse> {
  return postCommand(meetingId, 'end', authToken, signal)
}

/** 초안 팬미팅을 삭제한다. */
export async function deleteFanMeetingDraft(
  meetingId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<FanMeetingManagementResponse> {
  const response = await apiRequest<unknown>(meetingPath(meetingId), {
    method: 'DELETE',
    authToken,
    signal,
  })

  return unwrapEnvelope<FanMeetingManagementResponse>(response)
}

/** 팬미팅 운영 결과 통계를 조회한다. */
export async function getFanMeetingStatistics(
  meetingId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<FanMeetingStatisticsResponse> {
  const response = await apiRequest<unknown>(meetingPath(meetingId, '/statistics'), {
    method: 'GET',
    authToken,
    signal,
  })

  return unwrapEnvelope<FanMeetingStatisticsResponse>(response)
}

/**
 * 참가자별 운영 결과 CSV를 내려받는다.
 *
 * 공통 apiRequest는 JSON 응답 전용이라 파일 응답은 직접 fetch한다.
 * 파일명은 서버 Content-Disposition의 값을 그대로 쓰고, 읽지 못하면 기본값을 만든다.
 */
export async function downloadFanMeetingStatisticsCsv(
  meetingId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<{ blob: Blob; fileName: string }> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? ''
  const response = await fetch(`${baseUrl}${meetingPath(meetingId, '/statistics/export.csv')}`, {
    headers: { Authorization: `Bearer ${authToken}` },
    signal,
  })

  if (!response.ok) {
    throw new Error(
      response.status === 403
        ? '이 팬미팅의 결과를 내보낼 권한이 없습니다.'
        : `결과 파일을 내려받지 못했습니다. (HTTP ${response.status})`,
    )
  }

  const disposition = response.headers.get('Content-Disposition') ?? ''
  const encodedName = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]
  const plainName = /filename="?([^";]+)"?/i.exec(disposition)?.[1]
  const fileName = encodedName
    ? decodeURIComponent(encodedName)
    : plainName ?? `fan-meeting-${meetingId}-statistics.csv`

  return { blob: await response.blob(), fileName }
}
