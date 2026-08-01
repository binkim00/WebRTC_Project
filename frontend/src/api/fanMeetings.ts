import { apiRequest } from './client'

export type PublicFanMeetingStatus =
  | 'PUBLISHED'
  | 'APPLICATION_OPEN'
  | 'APPLICATION_CLOSED'
  | 'READY'
  | 'LIVE'
  | 'ENDED'

export type FanMeetingDetailStatus =
  | 'DRAFT'
  | PublicFanMeetingStatus
  | 'CANCELED'

export type FanMeetingApplicationStatus =
  | 'SUBMITTED'
  | 'WITHDRAWN'
  | 'SELECTED'
  | 'NOT_SELECTED'

export type PublicFanMeetingSummary = {
  meetingId: number
  title: string
  coverImageUrl: string | null
  influencerName: string
  scheduledStartAt: string
  status: PublicFanMeetingStatus
  applicationStartAt: string | null
  applicationEndAt: string | null
  applicationStatus: FanMeetingApplicationStatus | null
  applicationCount: number
  participantCount: number
}

export type PublicFanMeetingPage = {
  content: PublicFanMeetingSummary[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  hasNext: boolean
}

export type PublicFanMeetingQuery = {
  keyword?: string
  status?: PublicFanMeetingStatus
  page?: number
  size?: number
}

export type PublicFanMeetingDetail = {
  meeting: {
    meetingId: number
    status: FanMeetingDetailStatus
    influencerId: number
    title: string
    /** 백엔드에서 소개가 비어 있으면 null로 내려온다. */
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
      /** 대기실 개방 시각이며 아직 설정되지 않았으면 null이다. */
      queueOpenAt: string | null
      callDurationSec: number
      recordingEnabled: boolean
      translationEnabled: boolean
      reconnectGraceSec: number
      earlyStartMinutes: number
      maxRecallCount: number
    }
  }
  influencer: {
    influencerId: number
    name: string
    profileImageUrl: string | null
  }
  viewer: {
    applicationStatus: FanMeetingApplicationStatus | null
    participantStatus: string | null
    canApply: boolean
    canEnter: boolean
  }
}

const publicMeetingStatuses: readonly PublicFanMeetingStatus[] = [
  'PUBLISHED',
  'APPLICATION_OPEN',
  'APPLICATION_CLOSED',
  'READY',
  'LIVE',
  'ENDED',
]

const applicationStatuses: readonly FanMeetingApplicationStatus[] = [
  'SUBMITTED',
  'WITHDRAWN',
  'SELECTED',
  'NOT_SELECTED',
]

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null
}

function unwrapData(value: unknown): unknown {
  const record = asRecord(value)
  return record && 'data' in record ? record.data : value
}

function readString(value: unknown, fieldName: string): string {
  if (typeof value === 'string' && value.trim()) return value
  throw new TypeError(`${fieldName} 응답 형식이 올바르지 않습니다.`)
}

function readNullableString(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined) return null
  return readString(value, fieldName)
}

function readNumber(value: unknown, fieldName: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  throw new TypeError(`${fieldName} 응답 형식이 올바르지 않습니다.`)
}

function readBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value === 'boolean') return value
  throw new TypeError(`${fieldName} 응답 형식이 올바르지 않습니다.`)
}

function isPublicMeetingStatus(value: unknown): value is PublicFanMeetingStatus {
  return (
    typeof value === 'string' &&
    publicMeetingStatuses.includes(value as PublicFanMeetingStatus)
  )
}

function readApplicationStatus(
  value: unknown,
): FanMeetingApplicationStatus | null {
  if (value === null || value === undefined) return null
  if (
    typeof value === 'string' &&
    applicationStatuses.includes(value as FanMeetingApplicationStatus)
  ) {
    return value as FanMeetingApplicationStatus
  }
  throw new TypeError('applicationStatus 응답 형식이 올바르지 않습니다.')
}

function parseMeeting(value: unknown): PublicFanMeetingSummary {
  const record = asRecord(value)
  if (!record || !isPublicMeetingStatus(record.status)) {
    throw new TypeError('팬미팅 목록 응답 형식이 올바르지 않습니다.')
  }

  return {
    meetingId: readNumber(record.meetingId, 'meetingId'),
    title: readString(record.title, 'title'),
    coverImageUrl: readNullableString(record.coverImageUrl, 'coverImageUrl'),
    influencerName: readString(record.influencerName, 'influencerName'),
    scheduledStartAt: readString(record.scheduledStartAt, 'scheduledStartAt'),
    status: record.status,
    applicationStartAt: readNullableString(
      record.applicationStartAt,
      'applicationStartAt',
    ),
    applicationEndAt: readNullableString(
      record.applicationEndAt,
      'applicationEndAt',
    ),
    applicationStatus: readApplicationStatus(record.applicationStatus),
    applicationCount: readNumber(record.applicationCount, 'applicationCount'),
    participantCount: readNumber(record.participantCount, 'participantCount'),
  }
}

function parsePage(value: unknown): PublicFanMeetingPage {
  const record = asRecord(unwrapData(value))
  if (!record || !Array.isArray(record.content)) {
    throw new TypeError('팬미팅 페이지 응답 형식이 올바르지 않습니다.')
  }

  return {
    content: record.content.map(parseMeeting),
    page: readNumber(record.page, 'page'),
    size: readNumber(record.size, 'size'),
    totalElements: readNumber(record.totalElements, 'totalElements'),
    totalPages: readNumber(record.totalPages, 'totalPages'),
    hasNext: record.hasNext === true,
  }
}

function parseDetail(value: unknown): PublicFanMeetingDetail {
  const detail = asRecord(unwrapData(value))
  const meeting = asRecord(detail?.meeting)
  const application = asRecord(meeting?.application)
  const operation = asRecord(meeting?.operation)
  const influencer = asRecord(detail?.influencer)
  const viewer = asRecord(detail?.viewer)

  const status = meeting?.status
  const detailStatuses: readonly FanMeetingDetailStatus[] = [
    'DRAFT',
    ...publicMeetingStatuses,
    'CANCELED',
  ]

  if (
    !detail ||
    !meeting ||
    !application ||
    !operation ||
    !influencer ||
    !viewer ||
    typeof status !== 'string' ||
    !detailStatuses.includes(status as FanMeetingDetailStatus)
  ) {
    throw new TypeError('팬미팅 상세 응답 형식이 올바르지 않습니다.')
  }

  return {
    meeting: {
      meetingId: readNumber(meeting.meetingId, 'meeting.meetingId'),
      status: status as FanMeetingDetailStatus,
      influencerId: readNumber(
        meeting.influencerId,
        'meeting.influencerId',
      ),
      title: readString(meeting.title, 'meeting.title'),
      description: readNullableString(meeting.description, 'meeting.description'),
      coverImageUrl: readNullableString(
        meeting.coverImageUrl,
        'meeting.coverImageUrl',
      ),
      scheduledStartAt: readString(
        meeting.scheduledStartAt,
        'meeting.scheduledStartAt',
      ),
      application: {
        enabled: readBoolean(
          application.enabled,
          'meeting.application.enabled',
        ),
        startAt: readNullableString(
          application.startAt,
          'meeting.application.startAt',
        ),
        endAt: readNullableString(
          application.endAt,
          'meeting.application.endAt',
        ),
        resultAnnouncementAt: readNullableString(
          application.resultAnnouncementAt,
          'meeting.application.resultAnnouncementAt',
        ),
        capacity: readNumber(
          application.capacity,
          'meeting.application.capacity',
        ),
      },
      operation: {
        queueOpenAt: readNullableString(
          operation.queueOpenAt,
          'meeting.operation.queueOpenAt',
        ),
        callDurationSec: readNumber(
          operation.callDurationSec,
          'meeting.operation.callDurationSec',
        ),
        recordingEnabled: readBoolean(
          operation.recordingEnabled,
          'meeting.operation.recordingEnabled',
        ),
        translationEnabled: readBoolean(
          operation.translationEnabled,
          'meeting.operation.translationEnabled',
        ),
        reconnectGraceSec: readNumber(
          operation.reconnectGraceSec,
          'meeting.operation.reconnectGraceSec',
        ),
        earlyStartMinutes: readNumber(
          operation.earlyStartMinutes,
          'meeting.operation.earlyStartMinutes',
        ),
        maxRecallCount: readNumber(
          operation.maxRecallCount,
          'meeting.operation.maxRecallCount',
        ),
      },
    },
    influencer: {
      influencerId: readNumber(
        influencer.influencerId,
        'influencer.influencerId',
      ),
      name: readString(influencer.name, 'influencer.name'),
      profileImageUrl: readNullableString(
        influencer.profileImageUrl,
        'influencer.profileImageUrl',
      ),
    },
    viewer: {
      applicationStatus: readApplicationStatus(viewer.applicationStatus),
      participantStatus: readNullableString(
        viewer.participantStatus,
        'viewer.participantStatus',
      ),
      canApply: readBoolean(viewer.canApply, 'viewer.canApply'),
      canEnter: readBoolean(viewer.canEnter, 'viewer.canEnter'),
    },
  }
}

export async function fetchPublicFanMeetings(
  query: PublicFanMeetingQuery,
  authToken?: string,
  signal?: AbortSignal,
): Promise<PublicFanMeetingPage> {
  const search = new URLSearchParams()
  if (query.keyword?.trim()) search.set('keyword', query.keyword.trim())
  if (query.status) search.set('status', query.status)
  if (query.page !== undefined) search.set('page', String(query.page))
  if (query.size !== undefined) search.set('size', String(query.size))

  const suffix = search.size > 0 ? `?${search.toString()}` : ''
  const response = await apiRequest<unknown>(`/api/v1/fan-meetings${suffix}`, {
    authToken,
    signal,
  })

  return parsePage(response)
}

export async function fetchPublicFanMeetingDetail(
  meetingId: number,
  authToken?: string,
  signal?: AbortSignal,
): Promise<PublicFanMeetingDetail> {
  const response = await apiRequest<unknown>(
    `/api/v1/fan-meetings/${meetingId}`,
    {
      authToken,
      signal,
    },
  )

  return parseDetail(response)
}
