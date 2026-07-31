import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getAuthSession } from '../../api/auth'
import type { PageResponse } from '../../api/envelope'
import {
  getNotifications,
  markNotificationAsRead,
  type NotificationResponse,
  type NotificationType,
} from '../../api/notifications'
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Pagination,
  Spinner,
  type BadgeVariant,
} from '../../components'

const PAGE_SIZE = 10

const notificationTypeContent: Record<
  NotificationType,
  { label: string; variant: BadgeVariant }
> = {
  APPLICATION_RESULT: { label: '응모 결과', variant: 'primary' },
  QUEUE_ORDER_ASSIGNED: { label: '순번 배정', variant: 'info' },
  QUEUE_CHANGE_RESULT: { label: '순번 변경', variant: 'info' },
  ENTER_NOW: { label: '입장 안내', variant: 'success' },
  MEETING_CHANGED: { label: '팬미팅 변경', variant: 'warning' },
  MEETING_CANCELED: { label: '팬미팅 취소', variant: 'danger' },
}

function getNotificationLink(
  type: NotificationType,
  meetingId: number | null,
): string | undefined {
  if (meetingId === null) {
    return undefined
  }

  switch (type) {
    case 'APPLICATION_RESULT':
      return `/fan/events/${meetingId}/application-result`
    case 'ENTER_NOW':
    case 'QUEUE_ORDER_ASSIGNED':
    case 'QUEUE_CHANGE_RESULT':
      return `/fan/fan-meetings/${meetingId}/waiting`
    case 'MEETING_CHANGED':
    case 'MEETING_CANCELED':
      return `/fan/events/${meetingId}`
  }
}

function formatDateTime(iso: string): string {
  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return iso
  }

  const pad = (value: number) => String(value).padStart(2, '0')

  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function NotificationsPage() {
  const navigate = useNavigate()
  const [session] = useState(() => getAuthSession())
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageData, setPageData] = useState<PageResponse<NotificationResponse>>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!session) {
      setLoading(false)
      return
    }

    const abortController = new AbortController()
    setLoading(true)
    setError(undefined)

    getNotifications(
      {
        unreadOnly: unreadOnly || undefined,
        page: currentPage - 1,
        size: PAGE_SIZE,
      },
      session.accessToken,
      abortController.signal,
    )
      .then(setPageData)
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') {
          return
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : '알림 목록을 불러오지 못했습니다.',
        )
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setLoading(false)
        }
      })

    return () => abortController.abort()
  }, [session, unreadOnly, currentPage])

  async function handleNotificationClick(notification: NotificationResponse) {
    if (!session) {
      return
    }

    if (!notification.readAt) {
      try {
        const result = await markNotificationAsRead(
          notification.notificationId,
          session.accessToken,
        )
        setPageData((previous) =>
          previous
            ? {
                ...previous,
                content: previous.content.map((item) =>
                  item.notificationId === notification.notificationId
                    ? { ...item, readAt: result.readAt }
                    : item,
                ),
              }
            : previous,
        )
      } catch (readError: unknown) {
        console.warn('알림 읽음 처리에 실패했습니다.', readError)
      }
    }

    const link = getNotificationLink(notification.type, notification.meetingId)

    if (link) {
      navigate(link)
    }
  }

  if (!session) {
    return (
      <div className="mx-auto grid w-full max-w-4xl gap-6">
        <h1 className="text-4xl font-black tracking-[-0.045em]">알림</h1>
        <AlertBanner title="로그인이 필요합니다" variant="warning">
          알림을 확인하려면{' '}
          <Link className="font-semibold underline" to="/login">
            로그인
          </Link>
          해 주세요.
        </AlertBanner>
      </div>
    )
  }

  const notifications = pageData?.content ?? []
  const totalPages = Math.max(1, pageData?.totalPages ?? 1)

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-[-0.045em]">알림</h1>
          <p className="mt-3 text-[var(--color-text-secondary)]">
            응모 결과, 팬미팅 입장 안내 등 나에게 도착한 알림을 확인하세요.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              setUnreadOnly(false)
              setCurrentPage(1)
            }}
            size="sm"
            variant={unreadOnly ? 'secondary' : 'primary'}
          >
            전체
          </Button>
          <Button
            onClick={() => {
              setUnreadOnly(true)
              setCurrentPage(1)
            }}
            size="sm"
            variant={unreadOnly ? 'primary' : 'secondary'}
          >
            읽지 않음
          </Button>
        </div>
      </header>

      {error ? (
        <AlertBanner title="알림을 불러오지 못했습니다" variant="error">
          {error}
        </AlertBanner>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label="알림을 불러오는 중" />
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState
          description={
            unreadOnly
              ? '읽지 않은 알림이 없습니다.'
              : '아직 도착한 알림이 없습니다.'
          }
          title="알림이 없습니다"
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-[var(--color-divider)]">
              {notifications.map((notification) => {
                const isUnread = notification.readAt === null
                const typeContent = notificationTypeContent[notification.type]

                return (
                  <li key={notification.notificationId}>
                    <button
                      className={`grid w-full gap-1.5 px-6 py-5 text-left transition-colors hover:bg-[var(--color-surface-page)] focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:calc(var(--focus-ring-offset)*-1)] ${
                        isUnread ? 'bg-[var(--color-primary-coral-soft)]/40' : ''
                      }`}
                      onClick={() => void handleNotificationClick(notification)}
                      type="button"
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge variant={typeContent.variant}>{typeContent.label}</Badge>
                        {isUnread ? (
                          <span
                            aria-label="읽지 않은 알림"
                            className="size-2 rounded-full bg-[var(--color-primary-coral)]"
                          />
                        ) : null}
                        <span className="ml-auto text-xs text-[var(--color-text-tertiary)]">
                          {formatDateTime(notification.createdAt)}
                        </span>
                      </span>
                      <span
                        className={`text-base ${
                          isUnread
                            ? 'font-bold text-[var(--color-text-primary)]'
                            : 'font-semibold text-[var(--color-text-secondary)]'
                        }`}
                      >
                        {notification.title}
                      </span>
                      <span className="text-sm text-[var(--color-text-secondary)]">
                        {notification.message}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {!loading && notifications.length > 0 ? (
        <Pagination
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          totalPages={totalPages}
        />
      ) : null}
    </div>
  )
}
