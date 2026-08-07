import { useCallback, useEffect, useRef, useState } from 'react'
import { parseServerDate } from '../../api/serverTime'
import { usePolling } from '../../hooks/usePolling'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import moldEmptyImage from '../../assets/jelly-mold-empty.png'
import { getAuthSession } from '../../api/authSession'
import { NOTIFICATIONS_CHANGED_EVENT } from '../../api/notificationEvents'
import {
  getNotifications,
  markNotificationAsRead,
  type NotificationResponse,
  type NotificationType,
} from '../../api/notifications'
import { cn } from '../ui/cn'
import {
  localizeNotificationMessage,
  localizeNotificationTitle,
  translate,
  useTranslation,
} from '../../i18n'

const PANEL_SIZE = 5

/**
 * 주기 갱신 간격이다.
 *
 * 이 벨은 App 레이아웃에 있어 화면을 옮겨도 재마운트되지 않는다. 라우트 이동·행동 직후 갱신을
 * 함께 걸었지만, 다른 사람의 행동으로 생기는 알림(당첨 발표·순번 변경·입장 안내)은 이쪽에서
 * 알 방법이 없어 결국 주기가 유일한 통로다. 예전 60초는 "새로고침해야 바뀐다"는 체감을 줬다.
 * 한 번에 요청 2건(목록·읽지 않은 수)이 나가므로 무한정 줄이지는 않는다.
 */
const POLL_INTERVAL_MS = 15_000

/**
 * 행동 직후 갱신을 묶는 시간이다.
 *
 * 화면 하나에서 저장·발행처럼 요청이 잇달아 나가면 신호도 그만큼 온다. 조금 기다렸다가
 * 마지막 신호에만 한 번 조회하면 같은 결과를 훨씬 적은 요청으로 얻는다.
 */
const CHANGE_REFRESH_DELAY_MS = 700

/**
 * 조직 알림을 눌렀을 때 갈 조직 화면이다.
 *
 * 같은 알림이라도 매니저와 인플루언서가 보는 화면이 다르고, 알림 자체에는 목적지를 정할
 * 정보가 없다. 조직 화면이 없는 역할(팬·솔로)은 전체 알림 목록으로 보낸다.
 */
function organizationPath(): string {
  const role = getAuthSession()?.role
  if (role === 'MANAGER') return '/manager/organization'
  if (role === 'INFLUENCER') return '/influencer/organization'
  return '/notifications'
}

/** 알림 종류별 태그·강조색·이동 목적지다. 제품에 실제로 존재하는 사건만 다룬다. */
const typeContent = (): Record<
  NotificationType,
  {
    tag: string
    tone: 'coral' | 'warning' | 'muted'
    action: string
    to: (meetingId: number | null) => string
  }
> => ({
  APPLICATION_RESULT: {
    tag: translate('notificationBell.t9'),
    tone: 'coral',
    action: translate('notificationBell.t10'),
    to: (meetingId) =>
      meetingId === null ? '/notifications' : `/fan/events/${meetingId}/application-result`,
  },
  ENTER_NOW: {
    tag: translate('notificationBell.t11'),
    tone: 'coral',
    action: translate('notificationBell.t12'),
    to: (meetingId) =>
      meetingId === null ? '/notifications' : `/fan/fan-meetings/${meetingId}/waiting`,
  },
  QUEUE_ORDER_ASSIGNED: {
    tag: translate('notificationBell.t13'),
    tone: 'muted',
    action: translate('notificationBell.t14'),
    to: (meetingId) =>
      meetingId === null ? '/notifications' : `/fan/fan-meetings/${meetingId}/waiting`,
  },
  QUEUE_CHANGE_RESULT: {
    tag: translate('notificationBell.t15'),
    tone: 'muted',
    action: translate('notificationBell.t16'),
    to: (meetingId) =>
      meetingId === null ? '/notifications' : `/fan/fan-meetings/${meetingId}/waiting`,
  },
  MEETING_CHANGED: {
    tag: translate('notificationBell.t17'),
    tone: 'warning',
    action: translate('notificationBell.t18'),
    to: (meetingId) => (meetingId === null ? '/notifications' : `/fan/events/${meetingId}`),
  },
  MEETING_CANCELED: {
    tag: translate('notificationBell.t19'),
    tone: 'warning',
    action: translate('notificationBell.t20'),
    to: (meetingId) => (meetingId === null ? '/notifications' : `/fan/events/${meetingId}`),
  },
  MEETING_PUBLISHED: {
    tag: translate('notificationBell.t26'),
    tone: 'coral',
    action: translate('notificationBell.t27'),
    to: (meetingId) => (meetingId === null ? '/notifications' : `/fan/events/${meetingId}`),
  },
  // 조직 알림은 팬미팅에 딸리지 않아 meetingId가 없다. 목적지는 보는 사람의 역할로 정한다.
  ORGANIZATION_INVITED: {
    tag: translate('notificationBell.orgInvited.tag'),
    tone: 'coral',
    action: translate('notificationBell.orgInvited.action'),
    to: () => organizationPath(),
  },
  ORGANIZATION_INVITATION_ACCEPTED: {
    tag: translate('notificationBell.orgInvitationAccepted.tag'),
    tone: 'coral',
    action: translate('notificationBell.orgInvitationAccepted.action'),
    to: () => organizationPath(),
  },
  ORGANIZATION_MEMBER_REMOVED: {
    tag: translate('notificationBell.orgMemberRemoved.tag'),
    tone: 'warning',
    action: translate('notificationBell.orgMemberRemoved.action'),
    to: () => organizationPath(),
  },
})

const toneClass = {
  coral: 'text-[var(--color-primary-coral)]',
  warning: 'text-[var(--color-warning)]',
  muted: 'text-[var(--color-text-muted)]',
} as const

/** 방금 · N분 전 · N시간 전 · 어제 · 07.24 순으로 짧게 표기한다. */
function formatWhen(iso: string): string {
  const date = parseServerDate(iso)
  if (Number.isNaN(date.getTime())) return iso

  const diffMs = Date.now() - date.getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return translate('notificationBell.t21')
  if (minutes < 60) return translate('notificationBell.t22', { p0: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return translate('notificationBell.t23', { p0: hours })
  if (hours < 48) return translate('notificationBell.t24')
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

/**
 * 전역 헤더의 알림 벨과 드롭다운 패널이다. (Fan Notifications.dc.html)
 *
 * 결과 발표·팬미팅 시작 같은 사건을 화면 이동 없이 확인하는 진입점이며,
 * 전체 목록은 기존 /notifications 화면이 담당한다.
 */
export function NotificationBell() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationResponse[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    const token = getAuthSession()?.accessToken
    if (!token) return

    try {
      const [page, unreadPage] = await Promise.all([
        getNotifications({ page: 0, size: PANEL_SIZE }, token, signal),
        // 읽지 않은 수는 목록 페이지 크기와 무관하게 전체 집계가 필요하다.
        getNotifications({ unreadOnly: true, page: 0, size: 1 }, token, signal),
      ])
      setItems(page.content)
      setUnreadCount(unreadPage.totalElements)
    } catch {
      // 알림은 보조 정보라 실패해도 헤더와 화면 이동을 막지 않는다.
    }
  }, [])

  // 첫 마운트와 **라우트 이동**마다 다시 읽는다. 이 벨은 App 레이아웃에 있어 화면을 옮겨도
  // 재마운트되지 않으므로, pathname을 걸어 두지 않으면 아무리 돌아다녀도 배지가 그대로다.
  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load, pathname])

  // 알림을 만들 수 있는 행동(응모·발표·순번 변경·조직 초대 등) 직후에는 주기를 기다리지 않는다.
  // 어떤 화면에서 무엇을 했는지는 몰라도 되고, api/client가 보내 주는 신호만 받으면 된다.
  useEffect(() => {
    let timer: number | undefined

    const scheduleRefresh = () => {
      if (timer !== undefined) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        timer = undefined
        void load()
      }, CHANGE_REFRESH_DELAY_MS)
    }

    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, scheduleRefresh)
    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, scheduleRefresh)
    }
  }, [load])

  // 위 두 갱신이 닿지 않는 것(다른 사람의 행동으로 생긴 알림)은 주기 갱신이 받는다.
  // 탭이 보이지 않으면 쉬고, 화면에 복귀하면 즉시 따라잡는다.
  usePolling(load, {
    intervalMs: POLL_INTERVAL_MS,
    immediate: false,
    pauseWhenHidden: true,
    refreshOnFocus: true,
  })

  // 읽지 않은 수가 **늘어난** 순간에만 버튼을 딸랑 흔들고 배지를 튀긴다.
  // 첫 로드나 읽음 처리로 줄어드는 경우에는 흔들지 않는다.
  const [bellShakeKey, setBellShakeKey] = useState(0)
  const previousUnreadRef = useRef<number | undefined>(undefined)
  useEffect(() => {
    const previous = previousUnreadRef.current
    if (previous !== undefined && unreadCount > previous) {
      setBellShakeKey((key) => key + 1)
    }
    previousUnreadRef.current = unreadCount
  }, [unreadCount])

  useEffect(() => {
    if (!open) return

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  function toggle() {
    setOpen((current) => {
      // 패널을 열 때마다 최신 알림으로 갱신한다.
      if (!current) void load()
      return !current
    })
  }

  async function markRead(notificationId: number) {
    const token = getAuthSession()?.accessToken
    if (!token) return
    try {
      await markNotificationAsRead(notificationId, token)
    } catch {
      // 읽음 처리 실패는 이동을 막지 않으며 다음 조회에서 다시 반영된다.
    }
  }

  function openNotification(notification: NotificationResponse) {
    setOpen(false)
    if (!notification.readAt) {
      setUnreadCount((count) => Math.max(0, count - 1))
      void markRead(notification.notificationId)
    }
    // 모르는 알림 유형이어도 이동이 죽지 않게 전체 목록으로 보낸다.
    navigate(typeContent()[notification.type]?.to(notification.meetingId) ?? '/notifications')
  }

  async function readAll() {
    const unreadItems = items.filter((item) => !item.readAt)
    setItems((current) =>
      current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
    )
    setUnreadCount(0)
    await Promise.all(unreadItems.map((item) => markRead(item.notificationId)))
    void load()
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-label={unreadCount > 0 ? t('notificationBell.t25', { p0: unreadCount }) : t('notificationBell.t8')}
        className={cn(
          'flex min-h-11 items-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] border px-3 transition-colors',
          open
            ? 'border-[var(--color-primary-coral)] bg-[var(--color-primary-coral-soft)]'
            : 'border-[var(--color-border-control)] bg-[var(--color-surface-panel)] hover:border-[var(--color-text-muted)]',
        )}
        onClick={toggle}
        type="button"
      >
        {/* 새 알림이 도착하면 라벨이 딸랑 흔들리고 배지가 통 튀어 도착을 알린다. */}
        <span
          className={
            bellShakeKey > 0
              ? 'inline-block origin-top text-[15px] font-bold text-[var(--color-text-primary)] motion-safe:animate-[mj-bell-shake_700ms_ease-in-out]'
              : 'text-[15px] font-bold text-[var(--color-text-primary)]'
          }
          key={`label-${bellShakeKey}`}
        >
          {t('notificationBell.t1')}
        </span>
        {unreadCount > 0 ? (
          <span
            className={
              bellShakeKey > 0
                ? 'grid h-[22px] min-w-[22px] place-items-center rounded-full bg-[var(--color-primary-coral)] px-1.5 text-xs font-extrabold text-white tabular-nums motion-safe:animate-[mj-badge-pop_500ms_cubic-bezier(0.16,1,0.3,1)]'
                : 'grid h-[22px] min-w-[22px] place-items-center rounded-full bg-[var(--color-primary-coral)] px-1.5 text-xs font-extrabold text-white tabular-nums'
            }
            key={`badge-${bellShakeKey}`}
          >
            {unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <section
          aria-label={t('notificationBell.t2')}
          className="absolute right-0 top-[calc(100%+10px)] z-30 max-h-[460px] w-[400px] max-w-[calc(100vw-2rem)] overflow-auto rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface-panel)] shadow-[var(--shadow-modal)]"
        >
          <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-[var(--color-divider)] bg-[var(--color-surface-panel)] px-[18px] py-4">
            <h2 className="text-[17px] font-extrabold tracking-[-0.028em]">{t('notificationBell.t3')}</h2>
            {unreadCount > 0 ? (
              <button
                className="mj-font-label min-h-9 whitespace-nowrap px-2.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary-coral)]"
                onClick={() => void readAll()}
                type="button"
              >
                {t('notificationBell.t4')}
              </button>
            ) : null}
          </div>

          {items.length === 0 ? (
            <div className="grid place-items-center px-6 py-14 text-center" role="status">
              <img alt="" className="size-[72px] object-contain opacity-55" src={moldEmptyImage} />
              <strong className="mt-3.5 text-base font-extrabold">{t('notificationBell.t5')}</strong>
              <span className="mt-[7px] text-[15px] font-medium leading-[1.55] text-[var(--color-text-muted)]">
                {t('notificationBell.t6')}
              </span>
            </div>
          ) : (
            <>
              <ul className="m-0 list-none p-0">
                {items.map((notification) => {
                  // 백엔드가 프론트보다 먼저 새 알림 유형을 내보내도 패널이 죽지 않아야 한다.
                  const content: {
                    tag: string
                    tone: keyof typeof toneClass
                    action: string
                    to: (meetingId: number | null) => string
                  } = typeContent()[notification.type] ?? {
                    tag: translate('notificationBell.unknownTag'),
                    tone: 'muted',
                    action: translate('notificationBell.unknownAction'),
                    to: () => '/notifications',
                  }
                  const unread = !notification.readAt

                  return (
                    <li key={notification.notificationId}>
                      <button
                        className={cn(
                          'grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-3.5 border-b border-[var(--color-border-row)] px-[18px] py-4 text-left hover:bg-[var(--color-surface-subtle)]',
                          unread && 'bg-[var(--color-primary-coral-soft)]',
                        )}
                        onClick={() => openNotification(notification)}
                        type="button"
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            {unread ? (
                              <span
                                aria-hidden="true"
                                className="size-[7px] flex-none rounded-full bg-[var(--color-primary-coral)]"
                              />
                            ) : null}
                            <span className={cn('text-[13px] font-extrabold', toneClass[content.tone])}>
                              {content.tag}
                            </span>
                          </span>
                          <strong
                            className={cn(
                              'mt-[7px] block text-base leading-[1.45] tracking-[-0.022em]',
                              unread ? 'font-extrabold' : 'font-semibold',
                            )}
                          >
                            {localizeNotificationTitle(notification.type, notification.title)}
                          </strong>
                          <span className="mt-[5px] block text-[15px] font-medium leading-[1.55] text-[var(--color-text-muted)]">
                            {localizeNotificationMessage(
  notification.type,
  notification.message,
  notification.messageKey,
  notification.messageArgs,
)}
                          </span>
                          <span className="mt-2 block text-sm font-bold text-[var(--color-primary-coral)]">
                            {content.action}
                          </span>
                        </span>
                        <time className="whitespace-nowrap text-[13px] font-semibold tabular-nums text-[var(--color-text-muted)]">
                          {formatWhen(notification.createdAt)}
                        </time>
                      </button>
                    </li>
                  )
                })}
              </ul>
              <div className="px-[18px] py-3.5">
                <Link
                  className="mj-font-label flex min-h-[46px] items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border-control)] bg-[var(--color-surface-panel)] text-[15px] hover:border-[var(--color-primary-coral)] hover:text-[var(--color-primary-coral)]"
                  onClick={() => setOpen(false)}
                  to="/notifications"
                >
                  {t('notificationBell.t7')}
                </Link>
              </div>
            </>
          )}
        </section>
      ) : null}
    </div>
  )
}
