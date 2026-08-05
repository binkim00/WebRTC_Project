import { ApiError } from './ApiError'
import { apiRequest } from './client'
import { unwrapEnvelope } from './envelope'
import { translate, type TranslationKey } from '../i18n'

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
  /** 결과 발표 일시다. 응모 기간을 옮길 때 검증 순서(마감 ≤ 발표 < 시작)를 맞추는 데 쓴다. */
  applicationResultAnnouncementAt?: string | null
  /** 팬미팅 예정 시작 일시다. 응모 마감·결과 발표는 이보다 앞서야 한다. */
  scheduledStartAt?: string | null
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
  // PUBLISHED에서 APPLICATION_CLOSED를 허용하는 이유: 응모가 한 번 열리면 백엔드가 응모 일정을
  // 완전히 잠그므로(아래 transitionFanMeetingImmediately 주석 참고) 마감을 앞당길 수 있는 시점은
  // 열리기 전뿐이다. 이때는 응모 기간을 아주 짧게 접어 곧바로 마감되게 만든다.
  PUBLISHED: ['APPLICATION_OPEN', 'APPLICATION_CLOSED'],
  APPLICATION_OPEN: ['APPLICATION_CLOSED'],
  READY: ['LIVE'],
}

/**
 * 응모를 열고 곧바로 마감되도록 잡아 줄 기간이다.
 *
 * 백엔드는 응모 시작 < 마감을 요구하므로 0으로 둘 수 없고, 응모 시작 상태 전환을 담당하는
 * 스케줄러가 기본 60초 주기로 도므로 그보다 짧게 잡으면 열리기 전에 마감 시각이 지나 버린다.
 */
const MINIMAL_APPLICATION_WINDOW_MS = 90_000

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

/**
 * `/test-control`이 이 서버에 없어서 실패한 요청인지 확인한다.
 *
 * 백엔드는 `app.test-control.enabled`가 켜져 있고 prod 프로필이 아닐 때만 그 컨트롤러를 등록한다.
 * 배포 환경에서는 경로 자체가 없으므로 404가 돌아온다. 401·403(권한)이나 409(상태 충돌)와는
 * 원인이 다르므로 구분해서 안내해야 한다.
 */
function isTestControlUnavailable(cause: unknown): boolean {
  return cause instanceof ApiError && cause.status === 404
}

/** 취소 신호로 끊긴 요청인지 확인한다. 이 경우에는 대체 경로를 시도하지 않고 그대로 올린다. */
function isAborted(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError'
}

/**
 * 정식 API로 처리할 수 없는 일정 우회를 `/test-control`로 시도한다.
 *
 * 그 경로가 없는 환경(배포)에서는 무엇이 왜 막혔는지 알려 주는 오류로 바꿔 던진다. 이전에는
 * 404가 그대로 올라와 "요청을 처리하지 못했습니다"라는 일반 문구만 보였다.
 */
async function controlForTestOrExplain(
  meetingId: string | number,
  request: FanMeetingTestControlRequest,
  authToken: string,
  signal: AbortSignal | undefined,
  unavailableMessageKey: TranslationKey,
): Promise<FanMeetingManagementResponse> {
  try {
    return await controlFanMeetingForTest(meetingId, request, authToken, signal)
  } catch (cause) {
    if (isTestControlUnavailable(cause)) {
      throw new TypeError(translate(unavailableMessageKey))
    }
    throw cause
  }
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
      translate('meetingManagement.t1', { p0: currentStatus, p1: targetStatus }),
    )
  }

  const now = context.now ?? new Date()
  const nowValue = toServerLocalDateTime(now)

  if (targetStatus === 'APPLICATION_OPEN') {
    // 정식 경로: 아직 PUBLISHED이고 응모 시작 전이므로 PATCH로 응모 시작 일시를 현재로 당길 수 있다.
    // 상태 전환 자체는 백엔드 MeetingApplicationOpeningScheduler가 주기적으로 처리한다.
    const patch = applicationOpenNowPatch(now, context)
    if (patch) {
      try {
        return await patchFanMeeting(meetingId, patch, authToken, signal)
      } catch (cause) {
        if (isAborted(cause)) throw cause
        // 일정이 이미 과거로 밀려 검증을 통과할 수 없는 경우가 있어 테스트 경로로 한 번 더 시도한다.
      }
    }

    return controlForTestOrExplain(
      meetingId,
      { status: targetStatus, applicationOpenAt: nowValue },
      authToken,
      signal,
      'meetingManagement.t4',
    )
  }

  if (targetStatus === 'APPLICATION_CLOSED') {
    /*
     * 백엔드에는 "응모 마감" 명령이 없다. 상태 전환은 추첨(ApplicationDrawService)이 하고,
     * 그 추첨은 `now >= applicationCloseAt`일 때만 허용된다. 그런데 응모가 한 번 열리면
     * `hasApplicationStarted`가 참이 되어 응모 일정 PATCH가 전부 409로 막힌다.
     * 즉 **열린 뒤에는 마감을 앞당길 방법이 없다.**
     *
     * 그래서 아직 열리지 않은 PUBLISHED 상태에서는 응모 기간을 최소로 접어, 곧 열렸다가
     * 바로 마감되게 만든다. 이렇게 하면 잠시 뒤 추첨 → 결과 발표 → 시작으로 이어갈 수 있다.
     */
    if (currentStatus === 'PUBLISHED') {
      const patch = collapseApplicationWindowPatch(now, context)
      if (!patch) throw new TypeError(translate('meetingManagement.t8'))
      return patchFanMeeting(meetingId, patch, authToken, signal)
    }

    return controlForTestOrExplain(
      meetingId,
      { status: targetStatus, applicationCloseAt: nowValue },
      authToken,
      signal,
      'meetingManagement.t5',
    )
  }

  // 정식 경로: earlyStartMinutes는 응모가 열린 뒤에도 수정할 수 있는 몇 안 되는 운영 설정이다.
  // 조기 시작 허용 폭을 예정 시각까지 넓히면 POST /start가 그대로 통과한다.
  const earlyStartMinutes = minutesUntil(now, context.scheduledStartAt)
  if (earlyStartMinutes !== undefined) {
    try {
      await patchFanMeeting(
        meetingId,
        { operation: { earlyStartMinutes } },
        authToken,
        signal,
      )
      return await startFanMeetingWithOpenWaitingRoom(meetingId, authToken, signal)
    } catch (cause) {
      if (isAborted(cause)) throw cause
      // 예정 시각·대기열 오픈 시각이 검증을 통과하지 못하는 조합이면 테스트 경로로 넘어간다.
    }
  }

  // LIVE 강제 지정은 actualStartAt을 기록하지 않으므로 시작 시각을 현재로 옮긴 뒤 정식 start 명령을 호출한다.
  await controlForTestOrExplain(
    meetingId,
    // 즉시 시작 시 대기열 오픈도 현재 시각으로 맞춰야 참가자가 바로 입장할 수 있다.
    { scheduledStartAt: nowValue, waitingRoomOpenAt: nowValue },
    authToken,
    signal,
    'meetingManagement.t6',
  )
  return startFanMeeting(meetingId, authToken, signal)
}

/**
 * 응모를 지금 열기 위한 PATCH 본문을 만든다. 검증을 통과할 수 없으면 undefined다.
 *
 * 백엔드 `validateSchedule`이 요구하는 순서는 **응모 시작 < 응모 마감 ≤ 결과 발표 < 팬미팅 시작**이다.
 * 마감·발표 시각이 이미 지났으면 현재 이후로 밀어야 하는데, 팬미팅 시작 시각까지 지난 상태라면
 * 어떤 값을 넣어도 통과할 수 없으므로 아예 시도하지 않는다.
 */
function applicationOpenNowPatch(
  now: Date,
  context: ImmediateTransitionContext,
): FanMeetingUpdateRequest | undefined {
  const nowMs = now.getTime()
  const scheduledStartMs = serverLocalDateTimeMs(context.scheduledStartAt)
  if (!Number.isFinite(scheduledStartMs) || scheduledStartMs <= nowMs) return undefined

  const originalStartMs = serverLocalDateTimeMs(context.applicationStartAt)
  const originalEndMs = serverLocalDateTimeMs(context.applicationEndAt)
  const originalDurationMs = originalEndMs - originalStartMs

  // 원래 응모 기간을 유지하되, 팬미팅 시작 1분 전까지로 잘라 검증 순서를 지킨다.
  const latestEndMs = scheduledStartMs - 60_000
  const desiredEndMs =
    Number.isFinite(originalEndMs) && originalEndMs > nowMs
      ? originalEndMs
      : nowMs +
        (Number.isFinite(originalDurationMs) && originalDurationMs > 0
          ? originalDurationMs
          : 24 * 60 * 60_000)
  const endMs = Math.min(desiredEndMs, latestEndMs)
  if (endMs <= nowMs) return undefined

  const application: ApplicationSettingPatch = {
    startAt: toServerLocalDateTime(now),
    endAt: toServerLocalDateTime(new Date(endMs)),
  }

  // 결과 발표는 마감 이후이면서 팬미팅 시작 전이어야 한다. 기존 값이 그 범위를 벗어나면 함께 옮긴다.
  const announcementMs = serverLocalDateTimeMs(context.applicationResultAnnouncementAt)
  if (Number.isFinite(announcementMs)) {
    if (announcementMs < endMs || announcementMs >= scheduledStartMs) {
      const adjusted = Math.min(endMs + 60_000, scheduledStartMs - 1_000)
      if (adjusted < endMs) return undefined
      application.resultAnnouncementAt = toServerLocalDateTime(new Date(adjusted))
    }
  }

  return { application }
}

/**
 * 응모 기간을 "지금 열리고 곧 마감"으로 접는 PATCH 본문을 만든다.
 *
 * 백엔드 `validateSchedule`이 요구하는 순서(응모 시작 < 마감 ≤ 결과 발표 < 팬미팅 시작)를 모두
 * 만족해야 하므로, 팬미팅 시작 시각까지 남은 시간이 최소 기간보다 짧으면 만들 수 없다.
 */
function collapseApplicationWindowPatch(
  now: Date,
  context: ImmediateTransitionContext,
): FanMeetingUpdateRequest | undefined {
  const nowMs = now.getTime()
  const scheduledStartMs = serverLocalDateTimeMs(context.scheduledStartAt)
  if (!Number.isFinite(scheduledStartMs)) return undefined

  const endMs = nowMs + MINIMAL_APPLICATION_WINDOW_MS
  // 결과 발표까지 팬미팅 시작 전에 끼워 넣어야 하므로 여유를 한 칸 더 본다.
  if (endMs + 60_000 >= scheduledStartMs) return undefined

  const application: ApplicationSettingPatch = {
    startAt: toServerLocalDateTime(now),
    endAt: toServerLocalDateTime(new Date(endMs)),
  }

  // 결과 발표 시각은 마감 이후이면서 팬미팅 시작 전이어야 한다. 범위를 벗어나면 함께 옮긴다.
  const announcementMs = serverLocalDateTimeMs(context.applicationResultAnnouncementAt)
  if (
    Number.isFinite(announcementMs) &&
    (announcementMs < endMs || announcementMs >= scheduledStartMs)
  ) {
    application.resultAnnouncementAt = toServerLocalDateTime(new Date(endMs + 30_000))
  }

  return { application }
}

/**
 * 지금부터 예정 시작 시각까지 남은 분을 올림해 돌려준다.
 *
 * 조기 시작 허용 폭(`earlyStartMinutes`)으로 쓰이며, 백엔드는 `now >= 예정시각 - 허용폭`일 때
 * 시작을 허용한다. 경계에서 밀리지 않도록 1분을 더한다. 예정 시각을 알 수 없으면 undefined다.
 */
function minutesUntil(now: Date, scheduledStartAt?: string | null): number | undefined {
  const scheduledStartMs = serverLocalDateTimeMs(scheduledStartAt)
  if (!Number.isFinite(scheduledStartMs)) return undefined
  const diffMs = scheduledStartMs - now.getTime()
  if (diffMs <= 0) return 0
  return Math.ceil(diffMs / 60_000) + 1
}

/**
 * 팬미팅 시작 전에도 참가자가 대기실에서 장비를 점검할 수 있도록 대기열을 즉시 연다.
 *
 * 정식 경로(PATCH)는 응모가 시작되기 전에만 열려 있다. 그 뒤에는 백엔드가 `queueOpenAt` 변경을
 * 거부하므로 `/test-control`로 넘어간다.
 */
export async function openWaitingRoomImmediately(
  meetingId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<FanMeetingManagementResponse> {
  const nowValue = toServerLocalDateTime(new Date())

  try {
    return await patchFanMeeting(
      meetingId,
      { operation: { queueOpenAt: nowValue } },
      authToken,
      signal,
    )
  } catch (cause) {
    if (isAborted(cause)) throw cause
  }

  return controlForTestOrExplain(
    meetingId,
    { waitingRoomOpenAt: nowValue },
    authToken,
    signal,
    'meetingManagement.t7',
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
        ? translate('meetingManagement.t2')
        : translate('meetingManagement.t3', { p0: response.status }),
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
