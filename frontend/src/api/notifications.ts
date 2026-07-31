import { apiRequest } from './client'
import { buildQuery, unwrapEnvelope, type PageResponse } from './envelope'

export type NotificationType =
  | 'APPLICATION_RESULT'
  | 'QUEUE_ORDER_ASSIGNED'
  | 'QUEUE_CHANGE_RESULT'
  | 'ENTER_NOW'
  | 'MEETING_CHANGED'
  | 'MEETING_CANCELED'

export type NotificationResponse = {
  notificationId: number
  type: NotificationType
  title: string
  message: string
  /** 관련 팬미팅이 없으면 null */
  meetingId: number | null
  /** 읽지 않았으면 null */
  readAt: string | null
  createdAt: string
}

export type NotificationReadResponse = {
  notificationId: number
  readAt: string
}

type NotificationsQuery = {
  unreadOnly?: boolean
  page?: number
  size?: number
}

/** 내 알림 목록을 조회한다. */
export async function getNotifications(
  query: NotificationsQuery,
  authToken: string,
  signal?: AbortSignal,
): Promise<PageResponse<NotificationResponse>> {
  const response = await apiRequest<unknown>(
    `/api/v1/notifications${buildQuery(query)}`,
    { method: 'GET', authToken, signal },
  )

  return unwrapEnvelope<PageResponse<NotificationResponse>>(response)
}

/** 알림을 읽음 처리한다. */
export async function markNotificationAsRead(
  notificationId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<NotificationReadResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/notifications/${encodeURIComponent(String(notificationId))}/read`,
    { method: 'PATCH', authToken, signal },
  )

  return unwrapEnvelope<NotificationReadResponse>(response)
}
