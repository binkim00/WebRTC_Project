import { rememberFanCallSession } from './callSessionLog'
import { apiRequest } from './client'
import { translate } from '../i18n'

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
  operation?: {
    /** 대기열(대기실) 오픈 일시. 준비실에서 대기열 폴링 시작 여부를 판단할 때 사용한다. */
    queueOpenAt?: string
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
  /**
   * 이 참가자의 통화 세션 식별자다. 아직 호출된 적이 없으면 없다.
   *
   * AI 요약은 통화 세션 단위라 이 값이 있어야 조회할 수 있다. 서버가 대기열·참가자 관계로
   * 찾아 주므로, 통화를 지켜보지 않은 브라우저에서도 지난 회차의 요약을 열 수 있다.
   */
  latestCallSessionId?: string
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
  throw new TypeError(translate('fanMeetingParticipants.t1', { p0: fieldName }))
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

/** 서버가 숫자로 내려주는 선택적 식별자를 문자열로 맞춘다. 값이 없으면 undefined다. */
function readOptionalId(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return readOptionalString(value)
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
  if (!record) throw new TypeError(translate('fanMeetingParticipants.t2'))

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
    latestCallSessionId: readOptionalId(record.latestCallSessionId),
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

  if (!rawContent) throw new TypeError(translate('fanMeetingParticipants.t3'))

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
  const root = asRecord(data)
  const record = asRecord(root?.meeting) ?? root
  const influencer = asRecord(root?.influencer) ?? asRecord(record?.influencer)
  const application = asRecord(record?.application)
  const operation = asRecord(record?.operation)

  if (!record || !influencer) {
    throw new TypeError(translate('fanMeetingParticipants.t4'))
  }

  return {
    meetingId: readString(record.meetingId, 'meetingId'),
    title: readString(record.title, 'title'),
    status: readString(record.status, 'status'),
    scheduledStartAt: readOptionalString(record.scheduledStartAt),
    influencer: {
      influencerId: readString(influencer.influencerId, 'influencerId'),
      influencerName: readString(
        influencer.influencerName ?? influencer.name,
        'influencerName',
      ),
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
    operation: operation
      ? {
          queueOpenAt: readOptionalString(operation.queueOpenAt),
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
    throw new TypeError(translate('fanMeetingParticipants.t5'))
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
    throw new TypeError(translate('fanMeetingParticipants.t6'))
  }

  const currentCall = asRecord(record.currentCall)

  const queue: MeetingQueue = {
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

  // 진행 중인 통화의 (팬미팅, 팬) → 세션 대응을 남긴다. 백엔드에 지난 세션 조회 API가
  // 없어, 팬미팅이 끝난 뒤 팬 기록 화면이 AI 요약을 찾을 유일한 단서가 이 기록이다.
  // 대기열을 보는 모든 화면(통화 사이드패널·준비실·운영 콘솔)이 이 함수로 폴링하므로
  // 여기 한 곳에서 기록하면 통화마다 빠짐없이 남는다.
  if (queue.currentCall) {
    const inCallFanId = queue.entries.find(
      (entry) => entry.participantId === queue.currentCall?.participantId,
    )?.fanId
    if (inCallFanId) {
      rememberFanCallSession(meetingId, inCallFanId, queue.currentCall.callSessionId)
    }
  }

  return queue
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
    throw new TypeError(translate('fanMeetingParticipants.t7'))
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
    throw new TypeError(translate('fanMeetingParticipants.t8'))
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
  if (!record) throw new TypeError(translate('fanMeetingParticipants.t9'))

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
  /** 최근 메모만 필요한 화면은 기본값을 쓰고, 회차 목록이 필요한 화면은 크게 요청한다. */
  size = 5,
): Promise<FanMemoPage> {
  const data = await apiRequest<unknown>(
    `/api/v1/influencers/me/fans/${encodeURIComponent(fanId)}/memos?page=0&size=${size}`,
    { authToken, signal },
  )

  return parsePage(data, parseMemo, size)
}

/** 내가 개최한 팬미팅에 참가한 팬 한 명의 참여 집계다. 중복 참가는 한 건으로 합쳐진다. */
export type ParticipantFanSummary = {
  fanId: string
  nickname: string
  profileImageUrl?: string
  /** 참가한 팬미팅 회차 수 */
  participatedMeetingCount: number
  firstParticipatedAt: string
  lastParticipatedAt: string
}

export type ParticipantFanPage = {
  content: ParticipantFanSummary[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  hasNext: boolean
}

function parseParticipantFan(value: unknown): ParticipantFanSummary {
  const record = asRecord(value)
  if (!record) throw new TypeError(translate('fanMeetingParticipants.t10'))

  return {
    fanId: readString(record.fanId, 'fanId'),
    nickname: readString(record.nickname, 'nickname'),
    profileImageUrl: readOptionalString(record.profileImageUrl),
    participatedMeetingCount: readNumber(record.participatedMeetingCount),
    firstParticipatedAt: readString(record.firstParticipatedAt, 'firstParticipatedAt'),
    lastParticipatedAt: readString(record.lastParticipatedAt, 'lastParticipatedAt'),
  }
}

/** 내가 개최한 팬미팅에 참가한 팬을 중복 없이 최근 참여일 순으로 조회한다. */
export async function fetchMyParticipantFans(
  query: { page?: number; size?: number },
  authToken: string,
  signal?: AbortSignal,
): Promise<ParticipantFanPage> {
  const page = query.page ?? 0
  const size = query.size ?? 20
  const data = await apiRequest<unknown>(
    `/api/v1/influencers/me/participant-fans?page=${page}&size=${size}`,
    { authToken, signal },
  )

  return parsePage(data, parseParticipantFan, size)
}
