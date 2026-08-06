import { apiRequest } from './client'
import { translate } from '../i18n'

export type ManagerEvent = {
  eventId: string
  title: string
  createdAt: string
  applicationCount?: number
}

export type ManagerApplication = {
  applicationId: string
  nickname: string
  answer: string
  status: 'SELECTED' | 'HOLD' | 'UNSELECTED' | 'REVIEW'
  memo?: string
}

export type ManagerNotice = {
  noticeId: string
  title: string
  content: string
  status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED'
  publishAt?: string
}

/** 백엔드가 요구하는 이벤트 응모 기간과 모집 정원 설정이다. */
export type ApplicationSettingRequest = {
  enabled: boolean
  startAt: string | null
  endAt: string | null
  resultAnnouncementAt: string | null
  capacity: number
}

/** 당첨자 팬미팅에서 사용할 대기열과 영상통화 운영 설정이다. */
export type OperationSettingRequest = {
  queueOpenAt: string
  callDurationSec: number
  recordingEnabled: boolean
  translationEnabled: boolean
  reconnectGraceSec?: number | null
  earlyStartMinutes?: number | null
  maxRecallCount?: number | null
}

/**
 * 팬미팅이 실제 참가자를 정하는 방식이다. 생성 후에는 바꿀 수 없다.
 *
 * - APPLICATION: 멜리 내부에서 응모를 받고 추첨으로 참가자를 정한다.
 * - EXTERNAL_SELECTION: 외부에서 이미 선별한 명단을 CSV로 등록해 참가자를 정한다.
 */
export type ParticipantSelectionType = 'APPLICATION' | 'EXTERNAL_SELECTION'

/**
 * 현재 백엔드의 `POST /api/v1/fan-meetings` 요청 본문 구조이다.
 * 엔드포인트 이름과 달리 프런트에서는 홍보·응모 이벤트를 등록할 때 사용한다.
 */
export type FanMeetingCreateRequest = {
  influencerId: number
  title: string
  description: string | null
  coverImageUrl: string | null
  scheduledStartAt: string
  /** 생략하면 서버가 APPLICATION(응모 방식)으로 해석한다. 저장된 예전 로컬 초안에는 없을 수 있다. */
  participantSelectionType?: ParticipantSelectionType
  application: ApplicationSettingRequest
  operation: OperationSettingRequest
}

export type FanMeetingForm = FanMeetingCreateRequest

/** 이벤트 생성 후 백엔드가 돌려주는 생성 결과의 최소 구조이다. */
export type FanMeetingCreateResponse = FanMeetingCreateRequest & {
  meetingId: number
  status: 'DRAFT'
  organizationId: number | null
  managerId: number | null
  createdAt: string
}

export type FanMeetingPublishResponse = {
  meetingId: number
  status: 'PUBLISHED'
}

export type FanMeetingUpdateResponse = {
  meetingId: number
  status: string
}

/**
 * 일부 API가 `{ data: ... }` 응답 포맷을 사용하므로 실제 데이터만 꺼낸다.
 * 가공되지 않은 응답은 그대로 반환해 두 응답 형식을 모두 지원한다.
 */
function unwrap(value: unknown): unknown {
  if (typeof value === 'object' && value !== null && 'data' in value) {
    return (value as { data: unknown }).data
  }
  return value
}

/** 런타임 응답이 이벤트 생성 결과로 사용 가능한지 안전하게 확인한다. */
function isFanMeetingCreateResponse(value: unknown): value is FanMeetingCreateResponse {
  if (typeof value !== 'object' || value === null) return false

  const response = value as Record<string, unknown>

  return (
    typeof response.meetingId === 'number' &&
    Number.isFinite(response.meetingId) &&
    response.status === 'DRAFT' &&
    typeof response.createdAt === 'string'
  )
}

/**
 * 커버 이미지 주소를 백엔드 URL 검증에 맞는 http/https 문자열로 정규화한다.
 * 빈 값과 브라우저 미리보기용 data URL은 서버에 보내지 않는다.
 */
function normalizeCoverImageUrl(value: string | null): string | null {
  const trimmed = value?.trim() ?? ''

  if (!trimmed || trimmed.startsWith('data:')) {
    return null
  }

  if (trimmed.length > 2048) {
    throw new TypeError(translate('managerOperations.t1'))
  }

  let normalizedUrl: URL
  // 프로토콜 오류는 catch로 흘러 들어가도 그대로 다시 던져야 한다. 이전에는 오류 메시지 문자열을
  // 비교해 구분했는데, 메시지가 번역되면서 그 비교가 항상 실패해 프로토콜 오류까지 "올바른 URL이
  // 아니다"라는 엉뚱한 안내로 바뀌었다. 그래서 플래그로 구분한다.
  let protocolRejected = false
  try {
    normalizedUrl = new URL(trimmed)
    if (normalizedUrl.protocol !== 'http:' && normalizedUrl.protocol !== 'https:') {
      protocolRejected = true
      throw new TypeError(translate('managerOperations.t2'))
    }
  } catch (error) {
    if (protocolRejected) {
      throw error
    }
    throw new TypeError(translate('managerOperations.t3'))
  }

  // Java URL 검증기에서 경로의 대괄호를 거부할 수 있어 퍼센트 인코딩한다.
  // URL 객체의 직렬화 결과를 사용해 대괄호·공백 같은 문자를
  // 표준 percent-encoding으로 정규화한다.
  return normalizedUrl.toString()
}

/**
 * 서버 요청 전에 필수 값과 숫자 범위를 검사해 잘못된 요청을 빠르게 차단한다.
 *
 * 참고: `participantSelectionType`은 생성 마법사가 폼에서 직접 받는다(ManagerRoutePages의
 * 참가자 선별 방식 선택). 이 값을 보내지 않으면 백엔드가 `APPLICATION`으로 간주하고, 그 상태에서
 * 응모가 꺼져 있으면 "Application based meetings require enabled applications."로 생성을
 * 거부하므로(FanMeetingService.validateParticipantSelection) 요청 본문에 항상 함께 보낸다.
 */
function assertFanMeetingCreateRequest(payload: FanMeetingCreateRequest) {
  normalizeCoverImageUrl(payload.coverImageUrl)

  if (!Number.isInteger(payload.influencerId) || payload.influencerId <= 0) {
    throw new TypeError(translate('managerOperations.t4'))
  }

  if (!payload.title.trim()) {
    throw new TypeError(translate('managerOperations.t5'))
  }

  if (!payload.scheduledStartAt.trim()) {
    throw new TypeError(translate('managerOperations.t6'))
  }

  if (!payload.operation.queueOpenAt.trim()) {
    throw new TypeError(translate('managerOperations.t7'))
  }

  if (
    !Number.isInteger(payload.operation.callDurationSec) ||
    payload.operation.callDurationSec <= 0
  ) {
    throw new TypeError(translate('managerOperations.t8'))
  }

  if (payload.application.enabled) {
    if (
      !payload.application.startAt ||
      !payload.application.endAt ||
      !payload.application.resultAnnouncementAt ||
      !Number.isInteger(payload.application.capacity) ||
      payload.application.capacity <= 0
    ) {
      throw new TypeError(translate('managerOperations.t9'))
    }
  }

  if (payload.participantSelectionType === 'EXTERNAL_SELECTION') {
    if (payload.application.enabled) {
      throw new TypeError(translate('managerOperations.t10'))
    }
    if (!Number.isInteger(payload.application.capacity) || payload.application.capacity <= 0) {
      throw new TypeError(translate('managerOperations.t11'))
    }
  }
}

/**
 * 현재 백엔드 명세는 이벤트 등록 요청도 `/api/v1/fan-meetings`에서 받는다.
 * 프런트에서는 사용자에게 보이는 업무 의미에 맞춰 이벤트 생성 함수로 노출한다.
 * 백엔드에서 이벤트 전용 엔드포인트가 분리되면 이 함수의 요청 경로만 교체한다.
 */
export async function createEvent(
  payload: FanMeetingCreateRequest,
  authToken: string,
): Promise<FanMeetingCreateResponse> {
  assertFanMeetingCreateRequest(payload)

  // lab 브랜치의 FanMeetingCreateRequest 계약에 정의된 필드만 전송한다.
  // CSV 직접 등록(EXTERNAL_SELECTION)은 응모를 쓰지 않지만 capacity를 등록 가능한
  // 최대 인원으로 그대로 보낸다. 그 외 응모 미사용은 capacity가 의미 없으므로 0을 보내고,
  // 날짜는 null이어야 서비스의 비활성 응모 검증을 통과한다.
  const requestBody = {
    influencerId: payload.influencerId,
    title: payload.title.trim(),
    description: payload.description?.trim() || null,
    coverImageUrl: normalizeCoverImageUrl(payload.coverImageUrl),
    scheduledStartAt: payload.scheduledStartAt,
    // 폼이 고른 선별 방식을 그대로 보낸다. 값이 없으면 백엔드 기본값과 같은 APPLICATION이다.
    participantSelectionType: payload.participantSelectionType ?? 'APPLICATION',
    application: payload.application.enabled
      ? {
          enabled: true,
          startAt: payload.application.startAt,
          endAt: payload.application.endAt,
          resultAnnouncementAt: payload.application.resultAnnouncementAt,
          capacity: payload.application.capacity,
        }
      : {
          enabled: false,
          startAt: null,
          endAt: null,
          resultAnnouncementAt: null,
          capacity: payload.participantSelectionType === 'EXTERNAL_SELECTION'
            ? payload.application.capacity
            : 0,
        },
    operation: {
      queueOpenAt: payload.operation.queueOpenAt,
      callDurationSec: payload.operation.callDurationSec,
      recordingEnabled: payload.operation.recordingEnabled,
      translationEnabled: payload.operation.translationEnabled,
      reconnectGraceSec: payload.operation.reconnectGraceSec ?? null,
      earlyStartMinutes: payload.operation.earlyStartMinutes ?? null,
      maxRecallCount: payload.operation.maxRecallCount ?? null,
    },
  }

  if (import.meta.env.DEV) {
    console.info('[event:create] request body', requestBody)
  }

  const value = unwrap(
    await apiRequest<unknown>('/api/v1/fan-meetings', {
      method: 'POST',
      authToken,
      body: JSON.stringify(requestBody),
    }),
  )

  if (!isFanMeetingCreateResponse(value)) {
    throw new TypeError(translate('managerOperations.t12'))
  }

  return value
}

/** 기존 팬미팅 초안에 현재 생성 폼의 값을 저장한다. */
export async function updateFanMeeting(
  meetingId: number,
  payload: FanMeetingCreateRequest,
  authToken: string,
): Promise<FanMeetingUpdateResponse> {
  if (!Number.isInteger(meetingId) || meetingId <= 0) {
    throw new TypeError(translate('managerOperations.t13'))
  }

  assertFanMeetingCreateRequest(payload)

  const requestBody = {
    influencerId: payload.influencerId,
    title: payload.title.trim(),
    description: payload.description?.trim() || null,
    coverImageUrl: normalizeCoverImageUrl(payload.coverImageUrl),
    scheduledStartAt: payload.scheduledStartAt,
    // 수정에서도 선별 방식을 함께 보내 생성 때와 계약을 맞춘다.
    participantSelectionType: payload.participantSelectionType ?? 'APPLICATION',
    application: payload.application.enabled
      ? {
          ...payload.application,
          enabled: true,
        }
      : {
          enabled: false,
          startAt: null,
          endAt: null,
          resultAnnouncementAt: null,
          // 참가자 선별 방식은 생성 후 변경할 수 없어 수정 요청에는 담지 않지만,
          // CSV 직접 등록으로 만든 초안을 다시 저장할 때도 정원 값은 그대로 유지해야 한다.
          capacity: payload.participantSelectionType === 'EXTERNAL_SELECTION'
            ? payload.application.capacity
            : 0,
        },
    operation: {
      ...payload.operation,
      reconnectGraceSec: payload.operation.reconnectGraceSec ?? null,
      earlyStartMinutes: payload.operation.earlyStartMinutes ?? null,
      maxRecallCount: payload.operation.maxRecallCount ?? null,
    },
  }

  const value = unwrap(
    await apiRequest<unknown>(`/api/v1/fan-meetings/${meetingId}`, {
      method: 'PATCH',
      authToken,
      body: JSON.stringify(requestBody),
    }),
  )

  if (typeof value !== 'object' || value === null) {
    throw new TypeError(translate('managerOperations.t14'))
  }

  const response = value as Record<string, unknown>
  if (
    response.meetingId !== meetingId ||
    typeof response.status !== 'string'
  ) {
    throw new TypeError(translate('managerOperations.t15'))
  }

  return {
    meetingId,
    status: response.status,
  }
}

/** DRAFT 상태로 생성된 팬미팅을 공개 목록에 노출되는 PUBLISHED 상태로 전환한다. */
export async function publishFanMeeting(
  meetingId: number,
  authToken: string,
): Promise<FanMeetingPublishResponse> {
  if (!Number.isInteger(meetingId) || meetingId <= 0) {
    throw new TypeError(translate('managerOperations.t16'))
  }

  const value = unwrap(
    await apiRequest<unknown>(`/api/v1/fan-meetings/${meetingId}/publish`, {
      method: 'POST',
      authToken,
    }),
  )

  if (typeof value !== 'object' || value === null) {
    throw new TypeError(translate('managerOperations.t17'))
  }

  const response = value as Record<string, unknown>
  if (response.meetingId !== meetingId || response.status !== 'PUBLISHED') {
    throw new TypeError(translate('managerOperations.t18'))
  }

  return {
    meetingId,
    status: 'PUBLISHED',
  }
}
