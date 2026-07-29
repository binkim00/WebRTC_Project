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
  title: string
  influencerName: string
  scheduledStartAt: string
  durationMinutes: number
  recordingEnabled: boolean
}

export type EventForm = {
  title: string
  description: string
  applicationStartAt: string
  applicationEndAt: string
  capacity: number
}

function unwrap(value: unknown): unknown {
  if (typeof value === 'object' && value !== null && 'data' in value) {
    return (value as { data: unknown }).data
  }
  return value
}

export async function fetchManagerEvents(authToken: string, keyword = '', signal?: AbortSignal) {
  const params = new URLSearchParams({ page: '0', size: '10' })
  if (keyword.trim()) params.set('keyword', keyword.trim())
  const value = unwrap(await apiRequest<unknown>(`/api/v1/events?${params.toString()}`, { authToken, signal }))
  const content = Array.isArray(value) ? value : (value as { content?: unknown[] } | null)?.content ?? []
  return content as ManagerEvent[]
}

export async function fetchApplications(eventId: string, authToken: string, signal?: AbortSignal) {
  const value = unwrap(await apiRequest<unknown>(`/api/v1/events/${encodeURIComponent(eventId)}/applications?page=0&size=10`, { authToken, signal }))
  const content = Array.isArray(value) ? value : (value as { content?: unknown[] } | null)?.content ?? []
  return content as ManagerApplication[]
}

export async function fetchNotices(meetingId: string, authToken: string, signal?: AbortSignal) {
  const value = unwrap(await apiRequest<unknown>(`/api/v1/fan-meetings/${encodeURIComponent(meetingId)}/notices`, { authToken, signal }))
  return (Array.isArray(value) ? value : (value as { content?: unknown[] } | null)?.content ?? []) as ManagerNotice[]
}

export async function createFanMeeting(payload: FanMeetingForm, authToken: string) {
  return apiRequest('/api/v1/fan-meetings', { method: 'POST', authToken, body: JSON.stringify(payload) })
}

export async function updateFanMeeting(meetingId: string, payload: FanMeetingForm, authToken: string) {
  return apiRequest(`/api/v1/fan-meetings/${encodeURIComponent(meetingId)}`, { method: 'PATCH', authToken, body: JSON.stringify(payload) })
}

export async function createEvent(payload: EventForm, authToken: string) {
  return apiRequest('/api/v1/events', { method: 'POST', authToken, body: JSON.stringify(payload) })
}

export async function updateEvent(eventId: string, payload: EventForm, authToken: string) {
  return apiRequest(`/api/v1/events/${encodeURIComponent(eventId)}`, { method: 'PATCH', authToken, body: JSON.stringify(payload) })
}

export async function updateNotice(noticeId: string, payload: Pick<ManagerNotice, 'title' | 'content' | 'status' | 'publishAt'>, authToken: string) {
  return apiRequest(`/api/v1/notices/${encodeURIComponent(noticeId)}`, { method: 'PATCH', authToken, body: JSON.stringify(payload) })
}
