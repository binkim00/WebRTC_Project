import { apiRequest } from './client'

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

export type ApplicationSettingRequest = {
  enabled: boolean
  startAt: string | null
  endAt: string | null
  resultAnnouncementAt: string | null
  capacity: number
}

export type OperationSettingRequest = {
  queueOpenAt: string
  callDurationSec: number
  recordingEnabled: boolean
  translationEnabled: boolean
  reconnectGraceSec?: number | null
  earlyStartMinutes?: number | null
  maxRecallCount?: number | null
}

export type FanMeetingCreateRequest = {
  influencerId: number
  title: string
  description: string | null
  coverImageUrl: string | null
  scheduledStartAt: string
  application: ApplicationSettingRequest
  operation: OperationSettingRequest
}

export type FanMeetingForm = FanMeetingCreateRequest

export type FanMeetingCreateResponse = FanMeetingCreateRequest & {
  meetingId: number
  status: 'DRAFT'
  organizationId: number | null
  managerId: number | null
  createdAt: string
}

function unwrap(value: unknown): unknown {
  if (typeof value === 'object' && value !== null && 'data' in value) {
    return (value as { data: unknown }).data
  }
  return value
}

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

function normalizeCoverImageUrl(value: string | null): string | null {
  const trimmed = value?.trim() ?? ''

  if (!trimmed || trimmed.startsWith('data:')) {
    return null
  }

  if (trimmed.length > 2048) {
    throw new TypeError('커버 이미지 URL은 2048자 이하로 입력해 주세요.')
  }

  let normalizedUrl: URL
  try {
    normalizedUrl = new URL(trimmed)
    if (normalizedUrl.protocol !== 'http:' && normalizedUrl.protocol !== 'https:') {
      throw new TypeError('커버 이미지는 http 또는 https URL이어야 합니다.')
    }
  } catch (error) {
    if (error instanceof TypeError && error.message === '커버 이미지는 http 또는 https URL이어야 합니다.') {
      throw error
    }
    throw new TypeError('커버 이미지는 올바른 URL이어야 합니다.')
  }

  // Java URL 검증기에서 경로의 대괄호를 거부할 수 있어 퍼센트 인코딩한다.
  // URL 객체의 직렬화 결과를 사용해 대괄호·공백 같은 문자를
  // 표준 percent-encoding으로 정규화한다.
  return normalizedUrl.toString()
}

function assertFanMeetingCreateRequest(payload: FanMeetingCreateRequest) {
  normalizeCoverImageUrl(payload.coverImageUrl)

  if (!Number.isInteger(payload.influencerId) || payload.influencerId <= 0) {
    throw new TypeError('담당 인플루언서 ID는 1 이상의 정수여야 합니다.')
  }

  if (!payload.title.trim()) {
    throw new TypeError('팬미팅명을 입력해 주세요.')
  }

  if (!payload.scheduledStartAt.trim()) {
    throw new TypeError('팬미팅 시작 일시를 입력해 주세요.')
  }

  if (!payload.operation.queueOpenAt.trim()) {
    throw new TypeError('대기열 오픈 일시를 입력해 주세요.')
  }

  if (
    !Number.isInteger(payload.operation.callDurationSec) ||
    payload.operation.callDurationSec <= 0
  ) {
    throw new TypeError('1인 통화 시간은 1초 이상의 정수여야 합니다.')
  }

  if (payload.application.enabled) {
    if (
      !payload.application.startAt ||
      !payload.application.endAt ||
      !payload.application.resultAnnouncementAt ||
      !Number.isInteger(payload.application.capacity) ||
      payload.application.capacity <= 0
    ) {
      throw new TypeError('응모를 사용하는 경우 응모 기간·결과 발표 일시·정원을 입력해 주세요.')
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
  // 응모를 사용하지 않아도 capacity는 @NotNull이므로 0을 보내고,
  // 날짜는 null이어야 서비스의 비활성 응모 검증을 통과한다.
  const requestBody = {
    influencerId: payload.influencerId,
    title: payload.title.trim(),
    description: payload.description?.trim() || null,
    coverImageUrl: normalizeCoverImageUrl(payload.coverImageUrl),
    scheduledStartAt: payload.scheduledStartAt,
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
          capacity: 0,
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
    throw new TypeError('이벤트 생성 응답 형식이 올바르지 않습니다.')
  }

  return value
}
