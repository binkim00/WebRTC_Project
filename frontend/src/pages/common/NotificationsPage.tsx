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
import {
  localizeNotificationMessage,
  localizeNotificationTitle,
  translate,
  useTranslation,
} from '../../i18n'

const PAGE_SIZE = 10

const notificationTypeContent = (): Record<
  NotificationType,
  { label: string; variant: BadgeVariant }
> => ({
  APPLICATION_RESULT: { label: translate('notificationsPage.t18'), variant: 'primary' },
  QUEUE_ORDER_ASSIGNED: { label: translate('notificationsPage.t19'), variant: 'info' },
  QUEUE_CHANGE_RESULT: { label: translate('notificationsPage.t20'), variant: 'info' },
  ENTER_NOW: { label: translate('notificationsPage.t21'), variant: 'success' },
  MEETING_CHANGED: { label: translate('notificationsPage.t22'), variant: 'warning' },
  MEETING_CANCELED: { label: translate('notificationsPage.t23'), variant: 'danger' },
  MEETING_PUBLISHED: { label: translate('notificationsPage.t24'), variant: 'info' },
})

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
    case 'MEETING_PUBLISHED':
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
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [session] = useState(() => getAuthSession())
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageData, setPageData] = useState<PageResponse<NotificationResponse>>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [markingAll, setMarkingAll] = useState(false)

  /** 현재 페이지에서 아직 읽지 않은 알림 수다. 일괄 읽음 버튼의 노출과 문구에 쓴다. */
  const unreadCount = (pageData?.content ?? []).filter((item) => !item.readAt).length

  /**
   * 현재 페이지의 읽지 않은 알림을 한 번에 읽음 처리한다.
   *
   * 서버에 일괄 처리 API가 없어 개별 읽음 요청을 병렬로 보낸다(벨 패널과 같은 방식).
   * 목록은 요청 결과를 기다리지 않고 먼저 갱신해 버튼이 즉시 반응하게 하고, 실패한 건은
   * 다음 조회에서 다시 읽지 않음으로 돌아온다.
   */
  async function handleMarkAllRead() {
    if (!session || markingAll) return

    const unread = (pageData?.content ?? []).filter((item) => !item.readAt)
    if (unread.length === 0) return

    setMarkingAll(true)
    const readAt = new Date().toISOString()
    setPageData((previous) =>
      previous
        ? {
            ...previous,
            content: previous.content.map((item) => ({ ...item, readAt: item.readAt ?? readAt })),
          }
        : previous,
    )

    try {
      await Promise.all(
        unread.map((item) =>
          markNotificationAsRead(item.notificationId, session.accessToken).catch(() => undefined),
        ),
      )
    } finally {
      setMarkingAll(false)
    }
  }

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
            : t('notificationsPage.t14'),
        )
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setLoading(false)
        }
      })

    return () => abortController.abort()
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        console.warn(t('notificationsPage.t15'), readError)
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
        <h1 className="text-4xl font-black tracking-[-0.045em]">{t('notificationsPage.t1')}</h1>
        <AlertBanner title={t('notificationsPage.t2')} variant="warning">
          {t('notificationsPage.t3')}{' '}
          <Link className="font-semibold underline" to="/login">
            {t('notificationsPage.t4')}
          </Link>
          {t('notificationsPage.t5')}
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
          <h1 className="text-4xl font-black tracking-[-0.045em]">{t('notificationsPage.t6')}</h1>
          <p className="mt-3 text-[var(--color-text-secondary)]">
            {t('notificationsPage.t7')}
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
            {t('notificationsPage.t8')}
          </Button>
          <Button
            onClick={() => {
              setUnreadOnly(true)
              setCurrentPage(1)
            }}
            size="sm"
            variant={unreadOnly ? 'primary' : 'secondary'}
          >
            {t('notificationsPage.t9')}
          </Button>
          {/*
            하나씩 눌러 읽는 수고를 덜기 위한 일괄 읽음이다. 읽지 않은 알림이 없으면 감춘다.
            서버에 일괄 처리 API가 없어 개별 읽음을 병렬로 보낸다(벨 패널과 같은 방식).
          */}
          {unreadCount > 0 ? (
            <Button
              disabled={markingAll}
              loading={markingAll}
              onClick={() => void handleMarkAllRead()}
              size="sm"
              variant="secondary"
            >
              {t('notificationsPage.markAllRead', { count: unreadCount })}
            </Button>
          ) : null}
        </div>
      </header>

      {error ? (
        <AlertBanner title={t('notificationsPage.t10')} variant="error">
          {error}
        </AlertBanner>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('notificationsPage.t11')} />
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState
          description={
            unreadOnly
              ? t('notificationsPage.t16')
              : t('notificationsPage.t17')
          }
          title={t('notificationsPage.t12')}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-[var(--color-divider)]">
              {notifications.map((notification) => {
                const isUnread = notification.readAt === null
                const typeContent = notificationTypeContent()[notification.type]

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
                            aria-label={t('notificationsPage.t13')}
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
                        {localizeNotificationTitle(notification.type, notification.title)}
                      </span>
                      <span className="text-sm text-[var(--color-text-secondary)]">
                        {localizeNotificationMessage(
  notification.type,
  notification.message,
  notification.messageKey,
  notification.messageArgs,
)}
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
