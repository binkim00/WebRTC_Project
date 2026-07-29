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

export type FanMeetingForm = {
  influencerId: number
  title: string
  description: string | null
  coverImageUrl: string | null
  scheduledStartAt: string
  application: {
    enabled: boolean
    startAt: string | null
    endAt: string | null
    resultAnnouncementAt: string | null
    capacity: number
  }
  operation: {
    queueOpenAt: string
    callDurationSec: number
    recordingEnabled: boolean
    translationEnabled: boolean
  }
}

export type FanMeetingCreateResponse = FanMeetingForm & {
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

export async function createFanMeeting(
  payload: FanMeetingForm,
  authToken: string,
): Promise<FanMeetingCreateResponse> {
  const value = unwrap(
    await apiRequest<unknown>('/api/v1/fan-meetings', {
      method: 'POST',
      authToken,
      body: JSON.stringify(payload),
    }),
  )

  if (!isFanMeetingCreateResponse(value)) {
    throw new TypeError('팬미팅 생성 응답 형식이 올바르지 않습니다.')
  }

  return value
}
