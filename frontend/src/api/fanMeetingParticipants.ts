import { apiRequest } from './client'

export type QueueStatus =
  | 'WAITING'
  | 'CALLED'
  | 'IN_CALL'
  | 'COMPLETED'
  | 'NO_SHOW'
  | 'SKIPPED'
  | 'REMOVED'

export type MeetingDetail = {
  meetingId: string
  title: string
  status: string
  scheduledStartAt?: string
  influencer: {
    influencerId: string
    influencerName: string
    profileImageUrl?: string
  }
  application?: {
    capacity?: number
  }
}

export type FanMeetingParticipant = {
  participantId: string
  fanId: string
  nickname: string
  profileImageUrl?: string
  callOrder: number
  participantStatus: string
  queueStatus?: QueueStatus
  cameraOk?: boolean
  microphoneOk?: boolean
}

export type ParticipantPage = {
  content: FanMeetingParticipant[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  hasNext: boolean
}

export type QueueEntry = {
  queueEntryId: string
  participantId: string
  fanId: string
  nickname: string
  profileImageUrl?: string
  position: number
  status: QueueStatus
  callAttemptCount: number
  enteredAt?: string
}

export type MeetingQueue = {
  currentCall?: {
    callSessionId: string
    participantId: string
    nickname: string
    startedAt: string | null
    endsAt: string | null
  }
  entries: QueueEntry[]
}

export type QueueCallResponse = {
  queueEntryId: string
  status: 'CALLED'
  calledAt: string
  callAttemptCount: number
  callSessionId: string
  notificationSent: boolean
}

export type QueueNoShowResponse = {
  queueEntryId: string
  participantId: string
  position: number
  status: 'NO_SHOW'
  callAttemptCount: number
  calledAt: string
  noShowAt: string
}

export type FanMemo = {
  memoId: string
  meetingId: string
  meetingTitle: string
  content: string
  createdAt: string
  updatedAt: string
}

export type FanMemoPage = {
  content: FanMemo[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  hasNext: boolean
}

type ParticipantQuery = {
  keyword?: string
  page?: number
  size?: number
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function unwrapData(value: unknown): unknown {
  const record = asRecord(value)
  return record && 'data' in record ? record.data : value
}

function readString(value: unknown, fieldName: string): string {
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  throw new TypeError(`${fieldName} 응답 형식이 올바르지 않습니다.`)
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function isQueueStatus(value: unknown): value is QueueStatus {
  return (
    value === 'WAITING' ||
    value === 'CALLED' ||
    value === 'IN_CALL' ||
    value === 'COMPLETED' ||
    value === 'NO_SHOW' ||
    value === 'SKIPPED' ||
    value === 'REMOVED'
  )
}

function parseParticipant(value: unknown): FanMeetingParticipant {
  const record = asRecord(value)
  if (!record) throw new TypeError('참가자 응답 형식이 올바르지 않습니다.')

  return {
    participantId: readString(record.participantId, 'participantId'),
    fanId: readString(record.fanId, 'fanId'),
    nickname: readString(record.nickname, 'nickname'),
    profileImageUrl: readOptionalString(record.profileImageUrl),
    callOrder: readNumber(record.callOrder),
    participantStatus: readString(record.participantStatus, 'participantStatus'),
    queueStatus: isQueueStatus(record.queueStatus) ? record.queueStatus : undefined,
    cameraOk: readOptionalBoolean(record.cameraOk),
    microphoneOk: readOptionalBoolean(record.microphoneOk),
  }
}

function parsePage<T>(
  value: unknown,
  parseItem: (item: unknown) => T,
  defaultSize: number,
): {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  hasNext: boolean
} {
  const unwrapped = unwrapData(value)
  const record = asRecord(unwrapped)
  const rawContent = Array.isArray(unwrapped)
    ? unwrapped
    : record && Array.isArray(record.content)
      ? record.content
      : null

  if (!rawContent) throw new TypeError('목록 응답 형식이 올바르지 않습니다.')

  const content = rawContent.map(parseItem)
  const size = record ? readNumber(record.size, defaultSize) : defaultSize
  const totalElements = record ? readNumber(record.totalElements, content.length) : content.length
  const totalPages = record
    ? Math.max(1, readNumber(record.totalPages, Math.ceil(totalElements / Math.max(size, 1))))
    : 1

  return {
    content,
    page: record ? readNumber(record.page) : 0,
    size,
    totalElements,
    totalPages,
    hasNext: record?.hasNext === true,
  }
}

export async function fetchMeetingDetail(
  meetingId: string,
  authToken: string,
  signal?: AbortSignal,
): Promise<MeetingDetail> {
  const data = unwrapData(
    await apiRequest<unknown>(`/api/v1/fan-meetings/${encodeURIComponent(meetingId)}`, {
      authToken,
      signal,
    }),
  )
  const record = asRecord(data)
  const influencer = asRecord(record?.influencer)
  const application = asRecord(record?.application)

  if (!record || !influencer) {
    throw new TypeError('팬미팅 상세 응답 형식이 올바르지 않습니다.')
  }

  return {
    meetingId: readString(record.meetingId, 'meetingId'),
    title: readString(record.title, 'title'),
    status: readString(record.status, 'status'),
    scheduledStartAt: readOptionalString(record.scheduledStartAt),
    influencer: {
      influencerId: readString(influencer.influencerId, 'influencerId'),
      influencerName: readString(influencer.influencerName, 'influencerName'),
      profileImageUrl: readOptionalString(influencer.profileImageUrl),
    },
    application: application
      ? {
          capacity:
            typeof application.capacity === 'number' && Number.isFinite(application.capacity)
              ? application.capacity
              : undefined,
        }
      : undefined,
  }
}

export async function fetchParticipants(
  meetingId: string,
  query: ParticipantQuery,
  authToken: string,
  signal?: AbortSignal,
): Promise<ParticipantPage> {
  const search = new URLSearchParams()
  if (query.keyword?.trim()) search.set('keyword', query.keyword.trim())
  if (query.page !== undefined) search.set('page', String(query.page))
  if (query.size !== undefined) search.set('size', String(query.size))

  const suffix = search.size ? `?${search.toString()}` : ''
  const data = await apiRequest<unknown>(
    `/api/v1/fan-meetings/${encodeURIComponent(meetingId)}/participants${suffix}`,
    { authToken, signal },
  )

  return parsePage(data, parseParticipant, query.size ?? 6)
}

export async function fetchParticipantDetail(
  meetingId: string,
  participantId: string,
  authToken: string,
  signal?: AbortSignal,
): Promise<FanMeetingParticipant> {
  const data = await apiRequest<unknown>(
    `/api/v1/fan-meetings/${encodeURIComponent(meetingId)}/participants/${encodeURIComponent(participantId)}`,
    { authToken, signal },
  )

  return parseParticipant(unwrapData(data))
}

function parseQueueEntry(value: unknown): QueueEntry {
  const record = asRecord(value)
  if (!record || !isQueueStatus(record.status)) {
    throw new TypeError('대기열 응답 형식이 올바르지 않습니다.')
  }

  return {
    queueEntryId: readString(record.queueEntryId, 'queueEntryId'),
    participantId: readString(record.participantId, 'participantId'),
    fanId: readString(record.fanId, 'fanId'),
    nickname: readString(record.nickname, 'nickname'),
    profileImageUrl: readOptionalString(record.profileImageUrl),
    position: readNumber(record.position),
    status: record.status,
    callAttemptCount: readNumber(record.callAttemptCount),
    enteredAt: readOptionalString(record.enteredAt),
  }
}

export async function fetchMeetingQueue(
  meetingId: string,
  authToken: string,
  signal?: AbortSignal,
): Promise<MeetingQueue> {
  const data = unwrapData(
    await apiRequest<unknown>(
      `/api/v1/fan-meetings/${encodeURIComponent(meetingId)}/queue`,
      { authToken, signal },
    ),
  )
  const record = asRecord(data)
  if (!record || !Array.isArray(record.entries)) {
    throw new TypeError('운영 대기열 응답 형식이 올바르지 않습니다.')
  }

  const currentCall = asRecord(record.currentCall)

  return {
    currentCall: currentCall
      ? {
          callSessionId: readString(currentCall.callSessionId, 'callSessionId'),
          participantId: readString(currentCall.participantId, 'participantId'),
          nickname: readString(currentCall.nickname, 'nickname'),
          startedAt: readOptionalString(currentCall.startedAt) ?? null,
          endsAt: readOptionalString(currentCall.endsAt) ?? null,
        }
      : undefined,
    entries: record.entries.map(parseQueueEntry),
  }
}

export async function callQueueEntry(
  queueEntryId: string,
  authToken: string,
  signal?: AbortSignal,
): Promise<QueueCallResponse> {
  const data = unwrapData(
    await apiRequest<unknown>(
      `/api/v1/queue-entries/${encodeURIComponent(queueEntryId)}/call`,
      { method: 'POST', authToken, signal },
    ),
  )
  const record = asRecord(data)

  if (
    !record ||
    record.status !== 'CALLED' ||
    typeof record.notificationSent !== 'boolean'
  ) {
    throw new TypeError('팬 호출 응답 형식이 올바르지 않습니다.')
  }

  return {
    queueEntryId: readString(record.queueEntryId, 'queueEntryId'),
    status: 'CALLED',
    calledAt: readString(record.calledAt, 'calledAt'),
    callAttemptCount: readNumber(record.callAttemptCount),
    callSessionId: readString(record.callSessionId, 'callSessionId'),
    notificationSent: record.notificationSent,
  }
}

export async function markQueueEntryNoShow(
  queueEntryId: string,
  authToken: string,
  signal?: AbortSignal,
): Promise<QueueNoShowResponse> {
  const data = unwrapData(
    await apiRequest<unknown>(
      `/api/v1/queue-entries/${encodeURIComponent(queueEntryId)}/no-show`,
      { method: 'POST', authToken, signal },
    ),
  )
  const record = asRecord(data)

  if (!record || record.status !== 'NO_SHOW') {
    throw new TypeError('노쇼 처리 응답 형식이 올바르지 않습니다.')
  }

  return {
    queueEntryId: readString(record.queueEntryId, 'queueEntryId'),
    participantId: readString(record.participantId, 'participantId'),
    position: readNumber(record.position),
    status: 'NO_SHOW',
    callAttemptCount: readNumber(record.callAttemptCount),
    calledAt: readString(record.calledAt, 'calledAt'),
    noShowAt: readString(record.noShowAt, 'noShowAt'),
  }
}

function parseMemo(value: unknown): FanMemo {
  const record = asRecord(value)
  if (!record) throw new TypeError('팬 메모 응답 형식이 올바르지 않습니다.')

  return {
    memoId: readString(record.memoId, 'memoId'),
    meetingId: readString(record.meetingId, 'meetingId'),
    meetingTitle: readString(record.meetingTitle, 'meetingTitle'),
    content: readString(record.content, 'content'),
    createdAt: readString(record.createdAt, 'createdAt'),
    updatedAt: readString(record.updatedAt, 'updatedAt'),
  }
}

export async function fetchFanMemos(
  fanId: string,
  authToken: string,
  signal?: AbortSignal,
): Promise<FanMemoPage> {
  const data = await apiRequest<unknown>(
    `/api/v1/influencers/me/fans/${encodeURIComponent(fanId)}/memos?page=0&size=5`,
    { authToken, signal },
  )

  return parsePage(data, parseMemo, 5)
}
