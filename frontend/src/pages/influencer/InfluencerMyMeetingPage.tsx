import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { publishApplicationResults } from '../../api/applications'
import { ApiError } from '../../api/ApiError'
import {
  getAuthSession,
  type LoginRole,
} from '../../api/authSession'
import {
  fetchMeetingQueue,
  type MeetingQueue,
} from '../../api/fanMeetingParticipants'
import {
  fetchPublicFanMeetingDetail,
  type PublicFanMeetingDetail,
} from '../../api/fanMeetings'
import {
  fetchMyMeetings,
  type ManagerMeetingSummary,
} from '../../api/managerMeetings'
import { Button, Dialog } from '../../components'
import { meetingStatusLabel } from '../manager/meetingLifecycle'
import {
  getDashboardMeetingAction,
  selectRecentMeeting,
  type DashboardMeetingAction,
  type InfluencerDashboardRole,
} from './influencerMeetingDashboard'
import { translate, useTranslation } from '../../i18n'
import { parseServerDate } from '../../api/serverTime'

export type InfluencerMyMeetingPageProps = {
  role?: LoginRole
}

type TodayInsight = {
  detail?: PublicFanMeetingDetail
  queue?: MeetingQueue
}

type TodayStat = {
  label: string
  value: string
}

function formatClock(value?: string | null): string {
  if (!value) return translate('influencerMyMeetingPage.t21')
  const date = parseServerDate(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60

  if (hours > 0) return translate('influencerMyMeetingPage.t22', { p0: hours, p1: minutes })
  if (minutes > 0) return translate('influencerMyMeetingPage.t23', { p0: minutes, p1: seconds })
  return translate('influencerMyMeetingPage.t24', { p0: seconds })
}

function timeUntil(value: string, now: Date): string {
  const date = parseServerDate(value)
  if (Number.isNaN(date.getTime())) return translate('influencerMyMeetingPage.t25')
  const seconds = Math.floor((date.getTime() - now.getTime()) / 1000)
  return seconds <= 0 ? translate('influencerMyMeetingPage.t26') : formatDuration(seconds)
}

function statusTextClass(status?: string): string {
  if (status === 'LIVE') return 'text-[var(--color-success)]'
  if (status === 'APPLICATION_CLOSED') return 'text-[var(--color-warning)]'
  if (status === 'CANCELED') return 'text-[var(--color-error)]'
  return 'text-[var(--color-primary-coral)]'
}

function recentMeetingCopy(
  meeting: ManagerMeetingSummary,
  insight: TodayInsight,
  now: Date,
): { tag: string; description?: string; note?: string; stats: TodayStat[] } {
  const callDuration = insight.detail?.meeting.operation.callDurationSec

  if (meeting.status === 'LIVE') {
    const completed = insight.queue?.entries.filter(
      (entry) => entry.status === 'COMPLETED',
    ).length ?? 0
    const total = insight.queue?.entries.length || meeting.participantCount
    const currentFan = insight.queue?.currentCall?.nickname
    const startedAt = new Date(meeting.scheduledStartAt).getTime()
    const elapsed = Number.isNaN(startedAt)
      ? translate('influencerMyMeetingPage.t27')
      : formatDuration((now.getTime() - startedAt) / 1000)

    return {
      tag: translate('influencerMyMeetingPage.t28'),
      description: currentFan
        ? translate('influencerMyMeetingPage.t29', { p0: currentFan })
        : translate('influencerMyMeetingPage.t30'),
      note: translate('influencerMyMeetingPage.t31'),
      stats: [
        { label: translate('influencerMyMeetingPage.t32'), value: translate('influencerMyMeetingPage.t33', { p0: completed, p1: total }) },
        { label: translate('influencerMyMeetingPage.t34'), value: callDuration ? translate('influencerMyMeetingPage.t35', { p0: callDuration }) : translate('influencerMyMeetingPage.t36') },
        { label: translate('influencerMyMeetingPage.t37'), value: elapsed },
      ],
    }
  }

  if (meeting.status === 'READY') {
    return {
      tag: translate('influencerMyMeetingPage.t38'),
      description: translate('influencerMyMeetingPage.t39', { p0: formatClock(meeting.scheduledStartAt) }),
      note: translate('influencerMyMeetingPage.t40'),
      stats: [
        { label: translate('influencerMyMeetingPage.t41'), value: translate('influencerMyMeetingPage.t42', { p0: meeting.participantCount }) },
        { label: translate('influencerMyMeetingPage.t43'), value: callDuration ? translate('influencerMyMeetingPage.t44', { p0: callDuration }) : translate('influencerMyMeetingPage.t45') },
        { label: translate('influencerMyMeetingPage.t46'), value: timeUntil(meeting.scheduledStartAt, now) },
      ],
    }
  }

  if (meeting.status === 'APPLICATION_CLOSED' && meeting.participantCount > 0) {
    return {
      tag: translate('influencerMyMeetingPage.t47'),
      description: translate('influencerMyMeetingPage.t48'),
      note: translate('influencerMyMeetingPage.t49'),
      stats: [
        { label: translate('influencerMyMeetingPage.t50'), value: translate('influencerMyMeetingPage.t51', { p0: meeting.applicationCount }) },
        { label: translate('influencerMyMeetingPage.t52'), value: translate('influencerMyMeetingPage.t53', { p0: meeting.participantCount }) },
        {
          label: translate('influencerMyMeetingPage.t54'),
          value: formatClock(insight.detail?.meeting.application.resultAnnouncementAt),
        },
      ],
    }
  }

  return {
    tag: meetingStatusLabel(meeting.status),
    stats: [
      { label: translate('influencerMyMeetingPage.t55'), value: translate('influencerMyMeetingPage.t56', { p0: meeting.applicationCount }) },
      { label: translate('influencerMyMeetingPage.t57'), value: translate('influencerMyMeetingPage.t58', { p0: meeting.participantCount }) },
      { label: translate('influencerMyMeetingPage.t59'), value: formatClock(meeting.scheduledStartAt) },
    ],
  }
}

function DashboardSkeleton() {
  const { t } = useTranslation()
  return (
    <div aria-label={t('influencerMyMeetingPage.t1')} aria-live="polite" className="grid gap-5">
      <div className="h-5 w-28 rounded-[var(--radius-control)] bg-[var(--color-surface-muted)]" />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid gap-4">
          <div className="h-10 w-3/4 rounded-[var(--radius-control)] bg-[var(--color-surface-muted)]" />
          <div className="h-6 w-2/3 rounded-[var(--radius-control)] bg-[var(--color-surface-muted)]" />
          <div className="h-24 rounded-[var(--radius-panel)] bg-[var(--color-surface-muted)]" />
        </div>
        <div className="h-44 rounded-[var(--radius-panel)] bg-[var(--color-surface-muted)]" />
      </div>
    </div>
  )
}

type ActionButtonProps = {
  action: DashboardMeetingAction
  meeting: ManagerMeetingSummary
  onNavigate: (to: string) => void
  onPublishResults: (meeting: ManagerMeetingSummary) => void
  size?: 'md' | 'lg'
}

function ActionButton({
  action,
  meeting,
  onNavigate,
  onPublishResults,
  size = 'md',
}: ActionButtonProps) {
  if (action.kind === 'disabled') {
    return (
      <div className="grid gap-2">
        <Button disabled size={size}>{action.label}</Button>
        <p className="text-sm font-medium leading-relaxed text-[var(--color-text-muted)]">
          {action.reason}
        </p>
      </div>
    )
  }

  return (
    <Button
      onClick={() =>
        action.kind === 'navigate'
          ? onNavigate(action.to)
          : onPublishResults(meeting)
      }
      size={size}
    >
      {action.label}
    </Button>
  )
}

/** 최근 팬미팅 한 건의 다음 행동을 역할에 맞게 보여 주는 대시보드다. */
export function InfluencerMyMeetingPage({ role }: InfluencerMyMeetingPageProps = {}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [meetings, setMeetings] = useState<ManagerMeetingSummary[]>([])
  const [todayInsight, setTodayInsight] = useState<TodayInsight>({})
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [publishTarget, setPublishTarget] = useState<ManagerMeetingSummary>()
  const [reloadKey, setReloadKey] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const session = getAuthSession()
  const effectiveRole = role ?? session?.role
  const dashboardRole: InfluencerDashboardRole | undefined =
    effectiveRole === 'INFLUENCER' || effectiveRole === 'SOLO_INFLUENCER'
      ? effectiveRole
      : undefined
  const isSolo = dashboardRole === 'SOLO_INFLUENCER'
  const recentMeeting = useMemo(
    () => selectRecentMeeting(meetings, now),
    [meetings, now],
  )
  useEffect(() => {
    const controller = new AbortController()
    const currentSession = getAuthSession()

    if (!currentSession || !dashboardRole) {
      setError(t('influencerMyMeetingPage.t17'))
      setLoading(false)
      return () => controller.abort()
    }

    setLoading(true)
    setError(undefined)

    void (async () => {
      const firstPage = await fetchMyMeetings(
        { page: 0, size: 50 },
        currentSession.accessToken,
        controller.signal,
      )
      const allMeetings = [...firstPage.content]

      for (let page = 1; page < firstPage.totalPages; page += 1) {
        const nextPage = await fetchMyMeetings(
          { page, size: 50 },
          currentSession.accessToken,
          controller.signal,
        )
        allMeetings.push(...nextPage.content)
      }

      const recent = selectRecentMeeting(allMeetings)
      if (!recent) return { allMeetings, insight: {} as TodayInsight }

      const numericMeetingId = Number(recent.meetingId)
      const [detailResult, queueResult] = await Promise.allSettled([
        Number.isFinite(numericMeetingId)
          ? fetchPublicFanMeetingDetail(
              numericMeetingId,
              currentSession.accessToken,
              controller.signal,
            )
          : Promise.reject(new TypeError(t('influencerMyMeetingPage.t18'))),
        fetchMeetingQueue(
          recent.meetingId,
          currentSession.accessToken,
          controller.signal,
        ),
      ])

      return {
        allMeetings,
        insight: {
          detail: detailResult.status === 'fulfilled' ? detailResult.value : undefined,
          queue: queueResult.status === 'fulfilled' ? queueResult.value : undefined,
        },
      }
    })()
      .then(({ allMeetings, insight }) => {
        if (controller.signal.aborted) return
        setNow(new Date())
        setMeetings(allMeetings)
        setTodayInsight(insight)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(
          reason instanceof ApiError || reason instanceof TypeError
            ? reason.message
            : t('influencerMyMeetingPage.t19'),
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardRole, reloadKey])

  async function handlePublishResults() {
    const currentSession = getAuthSession()
    if (!publishTarget || !currentSession) return

    setPublishing(true)
    setError(undefined)
    try {
      await publishApplicationResults(
        publishTarget.meetingId,
        currentSession.accessToken,
      )
      setPublishTarget(undefined)
      setReloadKey((value) => value + 1)
    } catch (reason) {
      setPublishTarget(undefined)
      setError(
        reason instanceof Error
          ? reason.message
          : t('influencerMyMeetingPage.t20'),
      )
    } finally {
      setPublishing(false)
    }
  }

  const primaryAction =
    recentMeeting && dashboardRole
      ? getDashboardMeetingAction(recentMeeting, dashboardRole)
      : undefined
  const copy = recentMeeting ? recentMeetingCopy(recentMeeting, todayInsight, now) : undefined

  return (
    <div className="pb-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <h1 className="mj-font-title text-[clamp(1.75rem,3vw,2.25rem)] leading-tight tracking-[-0.04em] text-[var(--color-text-primary)]">
            {t('influencerMyMeetingPage.t2')}
          </h1>
          <p className="mt-2 text-base font-medium text-[var(--color-text-muted)]">
            {t('influencerMyMeetingPage.t3')}
          </p>
        </div>
        {isSolo ? (
          <Button
            onClick={() => navigate('/manager/fan-meetings/new')}
            variant="outline"
          >
            {t('influencerMyMeetingPage.t4')}
          </Button>
        ) : null}
      </div>

      <section
        aria-labelledby="today-meeting-title"
        className="mt-8 border-t border-[var(--color-divider)] pt-7"
      >
        {loading ? (
          <DashboardSkeleton />
        ) : error ? (
          <div>
            <h2
              className="text-2xl font-black tracking-[-0.038em] text-[var(--color-text-primary)]"
              id="today-meeting-title"
            >
              {t('influencerMyMeetingPage.t5')}
            </h2>
            <p className="mt-3 max-w-[48ch] text-base font-medium leading-relaxed text-[var(--color-text-body)]">
              {t('influencerMyMeetingPage.t6')}
            </p>
          </div>
        ) : recentMeeting && copy && primaryAction ? (
          <>
            <p
              className={`text-sm font-extrabold ${statusTextClass(recentMeeting.status)}`}
              role="status"
            >
              {copy.tag}
            </p>

            <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-11">
              <div className="min-w-0">
                <h2
                  className="mj-font-title text-[clamp(1.75rem,4vw,2.375rem)] leading-[1.16] tracking-[-0.045em] text-[var(--color-text-primary)]"
                  id="today-meeting-title"
                >
                  {recentMeeting.title}
                </h2>
                {copy.description ? (
                  <p className="mt-3 max-w-[48ch] text-base font-medium leading-relaxed text-[var(--color-text-body)]">
                    {copy.description}
                  </p>
                ) : null}

                <dl className="mt-7 grid grid-cols-1 border-t border-[var(--color-divider)] sm:grid-cols-3">
                  {copy.stats.map((stat) => (
                    <div
                      className="border-b border-[var(--color-divider)] py-4 sm:border-b-0 sm:border-l sm:px-6 sm:first:border-l-0 sm:first:pl-0"
                      key={stat.label}
                    >
                      <dt className="text-sm font-bold text-[var(--color-text-muted)]">
                        {stat.label}
                      </dt>
                      <dd className="mt-2 text-2xl font-black tabular-nums tracking-[-0.035em] text-[var(--color-text-primary)]">
                        {stat.value}
                      </dd>
                    </div>
                  ))}
                </dl>

                {copy.note ? (
                  <p className="mt-5 max-w-[56ch] text-base font-medium leading-relaxed text-[var(--color-text-muted)]">
                    {copy.note}
                  </p>
                ) : null}
              </div>

              <div className="grid content-start gap-2.5">
                <ActionButton
                  action={primaryAction}
                  meeting={recentMeeting}
                  onNavigate={navigate}
                  onPublishResults={setPublishTarget}
                  size="lg"
                />
                <Button
                  onClick={() => navigate(`/fan-meetings/${encodeURIComponent(recentMeeting.meetingId)}/fans`)}
                  variant="outline"
                >
                  {t('influencerMyMeetingPage.t7')}
                </Button>
                <Button
                  onClick={() =>
                    navigate(
                      isSolo
                        ? `/manager/fan-meetings/${encodeURIComponent(recentMeeting.meetingId)}`
                        : `/influencer/fan-meetings/${encodeURIComponent(recentMeeting.meetingId)}/ready`,
                    )
                  }
                  variant="outline"
                >
                  {t('influencerMyMeetingPage.t8')}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div>
            <h2
              className="text-2xl font-black tracking-[-0.038em] text-[var(--color-text-primary)]"
              id="today-meeting-title"
            >
              {t('influencerMyMeetingPage.t9')}
            </h2>
            <p className="mt-3 max-w-[48ch] text-base font-medium leading-relaxed text-[var(--color-text-body)]">
              {t('influencerMyMeetingPage.t10')}
            </p>
          </div>
        )}
      </section>

      <p className="mt-9 border-t border-[var(--color-divider)] pt-6">
        <Button
          onClick={() => navigate('/influencer/mypage/fan-meetings')}
          variant="text"
        >
          {t('influencerMyMeetingPage.t11')}
        </Button>
      </p>

      <Dialog
        description={t('influencerMyMeetingPage.t12')}
        footer={
          <>
            <Button
              disabled={publishing}
              onClick={() => setPublishTarget(undefined)}
              variant="outline"
            >
              {t('influencerMyMeetingPage.t13')}
            </Button>
            <Button loading={publishing} onClick={() => void handlePublishResults()}>
              {t('influencerMyMeetingPage.t14')}
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!open && !publishing) setPublishTarget(undefined)
        }}
        open={Boolean(publishTarget)}
        title={t('influencerMyMeetingPage.t15')}
      >
        {publishing ? (
          <p className="text-sm font-medium text-[var(--color-text-muted)]" role="status">
            {t('influencerMyMeetingPage.t16')}
          </p>
        ) : null}
      </Dialog>
    </div>
  )
}
