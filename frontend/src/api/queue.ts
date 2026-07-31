import { apiRequest } from './client'

type ApiEnvelope<T> = {
  success: boolean
  data: T
}

export type QueueEnterResponse = {
  queueEntryId: number
  position: number
  status: 'WAITING'
  enteredAt: string
  aheadCount: number
  estimatedWaitSec: number
}

export type QueueDisplayStatus = 'WAITING' | 'IN_CALL' | 'COMPLETED'

export type QueueSnapshotResponse = {
  queueEntryId: number
  position: number
  aheadCount: number
  estimatedWaitSec: number
  displayStatus: QueueDisplayStatus
  callAttemptCount: number
  calledAt: string | null
  callSessionId: number | null
  canEnterCall: boolean
}

function isQueueEnterResponse(value: unknown): value is QueueEnterResponse {
  if (typeof value !== 'object' || value === null) return false

  const response = value as Record<string, unknown>

  return (
    typeof response.queueEntryId === 'number' &&
    typeof response.position === 'number' &&
    response.status === 'WAITING' &&
    typeof response.enteredAt === 'string' &&
    typeof response.aheadCount === 'number' &&
    typeof response.estimatedWaitSec === 'number'
  )
}

function isQueueDisplayStatus(value: unknown): value is QueueDisplayStatus {
  return value === 'WAITING' || value === 'IN_CALL' || value === 'COMPLETED'
}

function isQueueSnapshotResponse(value: unknown): value is QueueSnapshotResponse {
  if (typeof value !== 'object' || value === null) return false

  const response = value as Record<string, unknown>

  return (
    typeof response.queueEntryId === 'number' &&
    typeof response.position === 'number' &&
    typeof response.aheadCount === 'number' &&
    typeof response.estimatedWaitSec === 'number' &&
    isQueueDisplayStatus(response.displayStatus) &&
    typeof response.callAttemptCount === 'number' &&
    (typeof response.calledAt === 'string' || response.calledAt === null) &&
    (typeof response.callSessionId === 'number' || response.callSessionId === null) &&
    typeof response.canEnterCall === 'boolean'
  )
}

export async function enterQueue(
  meetingId: string | number,
  authToken: string,
): Promise<QueueEnterResponse> {
  const response = await apiRequest<ApiEnvelope<unknown>>(
    `/api/v1/fan-meetings/${encodeURIComponent(String(meetingId))}/queue/enter`,
    {
      method: 'POST',
      authToken,
    },
  )

  if (!response.success || !isQueueEnterResponse(response.data)) {
    throw new TypeError('대기열 입장 응답 형식이 올바르지 않습니다.')
  }

  return response.data
}

export async function getMyQueue(
  meetingId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<QueueSnapshotResponse> {
  const response = await apiRequest<ApiEnvelope<unknown>>(
    `/api/v1/fan-meetings/${encodeURIComponent(String(meetingId))}/queue/me`,
    {
      method: 'GET',
      authToken,
      signal,
    },
  )

  if (!response.success || !isQueueSnapshotResponse(response.data)) {
    throw new TypeError('대기열 상태 응답 형식이 올바르지 않습니다.')
  }

  return response.data
}
