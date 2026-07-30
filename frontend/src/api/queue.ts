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
