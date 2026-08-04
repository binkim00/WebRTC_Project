import { apiRequest } from './client'
import { buildQuery, unwrapEnvelope, type PageResponse } from './envelope'

export type QueueChangeRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export type QueueChangeRequestDecision = 'APPROVED' | 'REJECTED'

export type QueuePositionChangeResponse = {
  previousPosition: number
  newPosition: number
  updatedAt: string
}

export type QueueChangeRequestCreateResponse = {
  requestId: number
  status: QueueChangeRequestStatus
  requestedAt: string
}

export type QueueChangeRequestSummaryResponse = {
  requestId: number
  fanId: number
  nickname: string
  profileImageUrl: string | null
  requestReason: string
  requestedAt: string
  previousPosition: number | null
  status: QueueChangeRequestStatus
}

export type QueueChangeRequestDecisionRequest = {
  decision: QueueChangeRequestDecision
  /** 승인 시 적용할 순번이며 생략하면 대기열 마지막으로 이동한다 */
  newPosition?: number
  /** 거절 사유이며 현재 스키마에는 저장되지 않는다 */
  rejectionReason?: string
}

export type QueueChangeRequestDecisionResponse = {
  requestId: number
  status: QueueChangeRequestStatus
  previousPosition: number
  /** 거절이면 null */
  changedPosition: number | null
  processedAt: string
}

type QueueChangeRequestsQuery = {
  status?: QueueChangeRequestStatus
  page?: number
  size?: number
}

/** 대기열 항목의 순번을 변경한다. (매니저 전용) */
export async function changeQueuePosition(
  queueEntryId: string | number,
  newPosition: number,
  authToken: string,
  reason?: string,
  signal?: AbortSignal,
): Promise<QueuePositionChangeResponse> {
  // reason이 비어 있으면 backend가 기본 안내 문구를 사용하므로
  // 빈 문자열 대신 undefined로 보내 불필요한 값을 저장하지 않는다.
  const response = await apiRequest<unknown>(
    `/api/v1/queue-entries/${encodeURIComponent(String(queueEntryId))}/position`,
    {
      method: 'PATCH',
      authToken,
      signal,
      body: JSON.stringify({ newPosition, reason: reason?.trim() || undefined }),
    },
  )

  return unwrapEnvelope<QueuePositionChangeResponse>(response)
}

/** 순서 미루기 요청을 접수한다. (팬 전용) */
export async function createQueueChangeRequest(
  queueEntryId: string | number,
  requestReason: string,
  authToken: string,
  signal?: AbortSignal,
): Promise<QueueChangeRequestCreateResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/queue-entries/${encodeURIComponent(String(queueEntryId))}/change-requests`,
    { method: 'POST', authToken, signal, body: JSON.stringify({ requestReason }) },
  )

  return unwrapEnvelope<QueueChangeRequestCreateResponse>(response)
}

/** 팬미팅의 순서 변경 요청 목록을 조회한다. (매니저 전용) */
export async function getQueueChangeRequests(
  meetingId: string | number,
  query: QueueChangeRequestsQuery,
  authToken: string,
  signal?: AbortSignal,
): Promise<PageResponse<QueueChangeRequestSummaryResponse>> {
  const response = await apiRequest<unknown>(
    `/api/v1/fan-meetings/${encodeURIComponent(String(meetingId))}/queue-change-requests${buildQuery(query)}`,
    { method: 'GET', authToken, signal },
  )

  return unwrapEnvelope<PageResponse<QueueChangeRequestSummaryResponse>>(response)
}

/** 순서 변경 요청을 승인하거나 거절한다. (매니저 전용) */
export async function decideQueueChangeRequest(
  requestId: string | number,
  request: QueueChangeRequestDecisionRequest,
  authToken: string,
  signal?: AbortSignal,
): Promise<QueueChangeRequestDecisionResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/queue-change-requests/${encodeURIComponent(String(requestId))}`,
    { method: 'PATCH', authToken, signal, body: JSON.stringify(request) },
  )

  return unwrapEnvelope<QueueChangeRequestDecisionResponse>(response)
}
