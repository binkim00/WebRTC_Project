import { apiRequest } from './client'

export type ManagerMeetingSummary = {
  meetingId: string
  title: string
  influencerName: string
  scheduledStartAt: string
  status?: string
}

export type ManagerMeetingPage = {
  content: ManagerMeetingSummary[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  hasNext: boolean
}

export type ManagerMeetingQuery = {
  keyword?: string
  page?: number
  size?: number
}

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
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  throw new TypeError(`${fieldName} 응답 형식이 올바르지 않습니다.`)
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function parseMeeting(value: unknown): ManagerMeetingSummary {
  const record = asRecord(value)
  const influencer = asRecord(record?.influencer)

  if (!record) {
    throw new TypeError('팬미팅 목록 응답 형식이 올바르지 않습니다.')
  }

  return {
    meetingId: readString(record.meetingId, 'meetingId'),
    title: readString(record.title, 'title'),
    influencerName: readString(
      influencer?.influencerName ?? record.influencerName,
      'influencerName',
    ),
    scheduledStartAt: readString(record.scheduledStartAt, 'scheduledStartAt'),
    status:
      typeof record.status === 'string' && record.status.trim()
        ? record.status
        : undefined,
  }
}

/**
 * 목록 경로는 저장된 Notion 공통 REST 규칙을 기준으로 분리한 연결 지점입니다.
 * 현재 로컬 backend에는 해당 컨트롤러가 없으므로, 백엔드 구현 시 경로와 DTO를
 * 최종 대조해야 합니다.
 */
export async function fetchManagerMeetings(
  query: ManagerMeetingQuery,
  authToken: string,
  signal?: AbortSignal,
): Promise<ManagerMeetingPage> {
  const search = new URLSearchParams()
  if (query.keyword?.trim()) search.set('keyword', query.keyword.trim())
  if (query.page !== undefined) search.set('page', String(query.page))
  if (query.size !== undefined) search.set('size', String(query.size))

  const suffix = search.size ? `?${search.toString()}` : ''
  const value = unwrapData(
    await apiRequest<unknown>(`/api/v1/fan-meetings${suffix}`, {
      authToken,
      signal,
    }),
  )
  const record = asRecord(value)
  const rawContent = Array.isArray(value)
    ? value
    : record && Array.isArray(record.content)
      ? record.content
      : null

  if (!rawContent) {
    throw new TypeError('팬미팅 목록 응답 형식이 올바르지 않습니다.')
  }

  const content = rawContent.map(parseMeeting)
  const size = record ? readNumber(record.size, query.size ?? 5) : query.size ?? 5
  const totalElements = record
    ? readNumber(record.totalElements, content.length)
    : content.length
  const totalPages = record
    ? Math.max(
        1,
        readNumber(
          record.totalPages,
          Math.ceil(totalElements / Math.max(size, 1)),
        ),
      )
    : 1

  return {
    content,
    page: record ? readNumber(record.page, query.page ?? 0) : query.page ?? 0,
    size,
    totalElements,
    totalPages,
    hasNext: record?.hasNext === true,
  }
}

export async function fetchMyMeetings(
  query: ManagerMeetingQuery,
  authToken: string,
  signal?: AbortSignal,
): Promise<ManagerMeetingPage> {
  const search = new URLSearchParams()
  if (query.keyword?.trim()) search.set('keyword', query.keyword.trim())
  if (query.page !== undefined) search.set('page', String(query.page))
  if (query.size !== undefined) search.set('size', String(query.size))

  const suffix = search.size ? `?${search.toString()}` : ''
  const value = unwrapData(
    await apiRequest<unknown>(`/api/v1/users/me/fan-meetings${suffix}`, {
      authToken,
      signal,
    }),
  )
  const record = asRecord(value)
  const rawContent = Array.isArray(value)
    ? value
    : record && Array.isArray(record.content)
      ? record.content
      : null

  if (!rawContent) {
    throw new TypeError('내 팬미팅 목록 응답 형식이 올바르지 않습니다.')
  }

  const content = rawContent.map(parseMeeting)
  const size = record ? readNumber(record.size, query.size ?? 20) : query.size ?? 20
  const totalElements = record
    ? readNumber(record.totalElements, content.length)
    : content.length

  return {
    content,
    page: record ? readNumber(record.page, query.page ?? 0) : query.page ?? 0,
    size,
    totalElements,
    totalPages: record
      ? Math.max(1, readNumber(record.totalPages, Math.ceil(totalElements / Math.max(size, 1))))
      : 1,
    hasNext: record?.hasNext === true,
  }
}
