import { apiRequest } from './client'

type ApiEnvelope<T> = {
  success: boolean
  data: T
}

export type QueueEnterResponse = {
  queueEntryId: number
  position: number
  status: string
  enteredAt: string
}

export type QueueSnapshotResponse = {
  queueEntryId: number
  position: number
  aheadCount: number
  estimatedWaitSec: number
  displayStatus: string
  callAttemptCount: number
  calledAt: string | null
  callSessionId: number | null
  canEnterCall: boolean
}

export type QueueCallResponse = {
  queueEntryId: number
  status: string
  calledAt: string
  callAttemptCount: number
  callSessionId: number
  notificationSent: boolean
}

function unwrap<T>(response: ApiEnvelope<T>): T {
  return response.data
}

export async function enterQueue(meetingId: string | number, authToken: string) {
  const response = await apiRequest<ApiEnvelope<QueueEnterResponse>>(
    `/api/v1/fan-meetings/${meetingId}/queue/enter`,
    { method: 'POST', authToken },
  )
  return unwrap(response)
}

export async function getMyQueue(meetingId: string | number, authToken: string) {
  const response = await apiRequest<ApiEnvelope<QueueSnapshotResponse>>(
    `/api/v1/fan-meetings/${meetingId}/queue/me`,
    { method: 'GET', authToken },
  )
  return unwrap(response)
}

export async function callQueueEntry(queueEntryId: string | number, authToken: string) {
  const response = await apiRequest<ApiEnvelope<QueueCallResponse>>(
    `/api/v1/queue-entries/${queueEntryId}/call`,
    { method: 'POST', authToken },
  )
  return unwrap(response)
}
