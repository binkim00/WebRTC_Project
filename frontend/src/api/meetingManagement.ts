import { apiRequest } from './client'
import { unwrapEnvelope } from './envelope'
import { translate } from '../i18n'

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

/**
 * 현재 백엔드가 제공하는 강제 전환 API를 운영 UI에서 안전하게 제한하기 위한 순방향 표다.
 *
 * 이 검사는 실수 방지용이며 최종 권한·상태 검증은 반드시 서버가 수행해야 한다. 프론트에서는
 * 과거 상태 복원이나 종료 상태 재개 같은 위험한 조합을 요청할 수 없게 막는다.
 */
const IMMEDIATE_TRANSITIONS: Partial<
  Record<FanMeetingStatus, readonly ImmediateFanMeetingStatus[]>
> = {
  // 서버의 정식 운영 명령이 상태와 일정을 한 트랜잭션으로 맞추므로 공개 직후에도 즉시 마감할 수 있다.
  PUBLISHED: ['APPLICATION_OPEN', 'APPLICATION_CLOSED'],
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
 * 접수 기간과 대기실 오픈 시각을 다시 잡는 일은 서버의 운영 명령이 맡는다. 상태와 기간이
 * 어긋나면 팬이 응모하거나 입장할 수 없으므로 한 트랜잭션에서 함께 바뀌어야 한다.
 */

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
 * 예약 시각을 기다리지 않고 다음 운영 상태로 넘긴다.
 *
 * <p>서버의 운영 명령이 상태와 함께 접수 기간·대기실 오픈 시각까지 맞춰 주므로 화면은
 * 목표 상태만 정하면 된다. 여기서는 되돌아가거나 종료 상태를 되살리는 조합을 미리 막고,
 * 최종 권한과 상태 검증은 서버가 다시 한다.
 *
 * @param meetingId 팬미팅 식별자
 * @param currentStatus 지금 상태
 * @param targetStatus 넘어갈 상태
 * @param authToken 액세스 토큰
 * @param signal 요청 취소 신호
 * @returns 전환된 팬미팅 관리 정보
 * @throws TypeError 순방향으로 허용하지 않는 조합인 경우
 */
export async function transitionFanMeetingImmediately(
  meetingId: string | number,
  currentStatus: FanMeetingStatus,
  targetStatus: ImmediateFanMeetingStatus,
  authToken: string,
  signal?: AbortSignal,
): Promise<FanMeetingManagementResponse> {
  const allowedTargets = IMMEDIATE_TRANSITIONS[currentStatus]
  if (!allowedTargets?.includes(targetStatus)) {
    throw new TypeError(
      translate('meetingManagement.t1', { p0: currentStatus, p1: targetStatus }),
    )
  }

  if (targetStatus === 'APPLICATION_OPEN') {
    // 접수 시작·마감 시각을 다시 잡는 일은 서버가 한다. 상태와 기간이 어긋나면 팬이
    // 응모할 수 없으므로 한 트랜잭션에서 함께 처리해야 한다.
    return postCommand(meetingId, 'applications/open', authToken, signal)
  }

  if (targetStatus === 'APPLICATION_CLOSED') {
    return postCommand(meetingId, 'applications/close', authToken, signal)
  }

  // 정식 시작 명령은 대기실 오픈 시각을 건드리지 않는다. 먼저 대기실을 열어야 참가자가
  // 바로 들어올 수 있다.
  await postCommand(meetingId, 'waiting-room/open', authToken, signal)
  return startFanMeeting(meetingId, authToken, signal)
}

/**
 * 팬미팅 시작 전에도 참가자가 대기실에서 장비를 점검할 수 있도록 대기열을 즉시 연다.
 *
 * 서버의 정식 운영 명령이 대기실 오픈 시각을 현재로 갱신한다.
 */
export async function openWaitingRoomImmediately(
  meetingId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<FanMeetingManagementResponse> {
  return postCommand(meetingId, 'waiting-room/open', authToken, signal)
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
