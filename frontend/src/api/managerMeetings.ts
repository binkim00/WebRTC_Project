import { apiRequest } from './client'
import { translate } from '../i18n'

export type ManagerMeetingSummary = {
  meetingId: string
  title: string
  influencerName: string
  scheduledStartAt: string
  /** 생성 시각이 제공되지 않는 구버전 응답에서는 null이다. */
  createdAt?: string | null
  status?: string
  /** 응모 시작 일시이며 응모를 사용하지 않으면 null이다. */
  applicationStartAt: string | null
  /** 응모 마감 일시이며 응모를 사용하지 않으면 null이다. */
  applicationEndAt: string | null
  /** 지금까지 접수된 응모 수다. */
  applicationCount: number
  /** 추첨으로 확정된 참가자 수다. */
  participantCount: number
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
  status?: string
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
  throw new TypeError(translate('managerMeetings.t1', { p0: fieldName }))
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** 값이 문자열일 때만 그대로 쓰고 나머지는 null로 정규화한다. */
function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function parseMeeting(value: unknown): ManagerMeetingSummary {
  const record = asRecord(value)
  const influencer = asRecord(record?.influencer)

  if (!record) {
    throw new TypeError(translate('managerMeetings.t2'))
  }

  return {
    meetingId: readString(record.meetingId, 'meetingId'),
    title: readString(record.title, 'title'),
    influencerName: readString(
      influencer?.influencerName ?? record.influencerName,
      'influencerName',
    ),
    scheduledStartAt: readString(record.scheduledStartAt, 'scheduledStartAt'),
    createdAt: readNullableString(record.createdAt),
    status:
      typeof record.status === 'string' && record.status.trim()
        ? record.status
        : undefined,
    applicationStartAt: readNullableString(record.applicationStartAt),
    applicationEndAt: readNullableString(record.applicationEndAt),
    applicationCount: readNumber(record.applicationCount, 0),
    participantCount: readNumber(record.participantCount, 0),
  }
}

/** 공개 팬미팅 목록 API를 조회하며 서버가 지원하는 keyword/page/size 쿼리를 그대로 전달한다. */
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
    throw new TypeError(translate('managerMeetings.t3'))
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

/** 로그인한 매니저 또는 인플루언서가 담당하는 팬미팅을 상태별로 조회한다. */
export async function fetchOwnedMeetings(
  query: ManagerMeetingQuery,
  authToken: string,
  signal?: AbortSignal,
): Promise<ManagerMeetingPage> {
  const keyword = query.keyword?.trim().toLocaleLowerCase('ko-KR')
  if (keyword) {
    // 소유 팬미팅 API는 keyword를 받지 않으므로 모든 서버 페이지를 읽은 뒤 로컬에서 정확히 검색·재페이지화한다.
    const firstPage = await fetchOwnedMeetings(
      { status: query.status, page: 0, size: 100 },
      authToken,
      signal,
    )
    const allMeetings = [...firstPage.content]

    for (let page = 1; page < firstPage.totalPages; page += 1) {
      signal?.throwIfAborted()
      const nextPage = await fetchOwnedMeetings(
        { status: query.status, page, size: 100 },
        authToken,
        signal,
      )
      allMeetings.push(...nextPage.content)
    }

    const filtered = allMeetings.filter((meeting) =>
      meeting.title.toLocaleLowerCase('ko-KR').includes(keyword) ||
      meeting.influencerName.toLocaleLowerCase('ko-KR').includes(keyword),
    )
    const page = Math.max(0, query.page ?? 0)
    const size = Math.max(1, query.size ?? 20)
    const totalPages = Math.max(1, Math.ceil(filtered.length / size))

    return {
      content: filtered.slice(page * size, (page + 1) * size),
      page,
      size,
      totalElements: filtered.length,
      totalPages,
      hasNext: page + 1 < totalPages,
    }
  }

  const search = new URLSearchParams()
  if (query.status) search.set('status', query.status)
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
    throw new TypeError(translate('managerMeetings.t4'))
  }

  const content = rawContent.map(parseMeeting)
  const size = record
    ? readNumber(record.size, query.size ?? 20)
    : query.size ?? 20
  const totalElements = record
    ? readNumber(record.totalElements, content.length)
    : content.length

  return {
    content,
    page: record ? readNumber(record.page, query.page ?? 0) : query.page ?? 0,
    size,
    totalElements,
    totalPages: record
      ? Math.max(
          1,
          readNumber(
            record.totalPages,
            Math.ceil(totalElements / Math.max(size, 1)),
          ),
        )
      : 1,
    hasNext: record?.hasNext === true,
  }
}

/** 기존 화면에서 사용하는 내 팬미팅 조회 함수명과의 호환을 유지한다. */
export const fetchMyMeetings = fetchOwnedMeetings
