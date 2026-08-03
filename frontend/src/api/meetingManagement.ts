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
