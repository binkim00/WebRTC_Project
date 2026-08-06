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
  /**
   * 본문을 화면 언어로 다시 만들 때 쓰는 사전 키다. 예전에 만든 알림은 null이다.
   *
   * 서버는 알림을 만든 시점 수신자의 선호 언어로 `message`를 저장한다. 화면 언어는 계정
   * 선호 언어와 따로 움직이므로, 저장된 문장만으로는 화면 언어를 따라갈 수 없다.
   */
  messageKey: string | null
  /** 본문 자리표시자 이름별 값이며 담을 값이 없으면 null이다. */
  messageArgs: Record<string, string> | null
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
