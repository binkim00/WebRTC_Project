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
  if (!value) return '미정'
  const date = new Date(value)
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

  if (hours > 0) return `${hours}시간 ${minutes}분`
  if (minutes > 0) return `${minutes}분 ${seconds}초`
  return `${seconds}초`
}

function timeUntil(value: string, now: Date): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '시간 확인 필요'
  const seconds = Math.floor((date.getTime() - now.getTime()) / 1000)
  return seconds <= 0 ? '곧 시작' : formatDuration(seconds)
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
      ? '확인 중'
      : formatDuration((now.getTime() - startedAt) / 1000)

    return {
      tag: '지금 진행 중',
      description: currentFan
        ? `${currentFan} 님과의 통화를 진행하고 있어요.`
        : '현재 팬과의 통화를 진행하고 있어요.',
      note: '통화 중에는 운영 화면을 볼 수 없습니다. 노쇼와 순서 변경은 통화 화면 안에서 처리합니다.',
      stats: [
        { label: '완료', value: `${completed} / ${total}명` },
        { label: '1인 통화', value: callDuration ? `${callDuration}초` : '확인 중' },
        { label: '경과', value: elapsed },
      ],
    }
  }

  if (meeting.status === 'READY') {
    return {
      tag: '진행 예정',
      description: `${formatClock(meeting.scheduledStartAt)}에 시작합니다. 시작 전 장비를 점검해 주세요.`,
      note: '장비 점검을 마치면 시작 시간에 첫 번째 팬과 연결됩니다.',
      stats: [
        { label: '확정 참가자', value: `${meeting.participantCount}명` },
        { label: '1인 통화', value: callDuration ? `${callDuration}초` : '확인 중' },
        { label: '시작까지', value: timeUntil(meeting.scheduledStartAt, now) },
      ],
    }
  }

  if (meeting.status === 'APPLICATION_CLOSED' && meeting.participantCount > 0) {
    return {
      tag: '확인할 일',
      description: '추첨이 끝났습니다. 결과를 발표하면 응모자 전원에게 알림이 갑니다.',
      note: '발표 후에는 당첨 명단을 바꿀 수 없습니다.',
      stats: [
        { label: '응모', value: `${meeting.applicationCount}명` },
        { label: '당첨', value: `${meeting.participantCount}명` },
        {
          label: '발표 예정',
          value: formatClock(insight.detail?.meeting.application.resultAnnouncementAt),
        },
      ],
    }
  }

  return {
    tag: meetingStatusLabel(meeting.status),
    stats: [
      { label: '응모', value: `${meeting.applicationCount}명` },
      { label: '확정 참가자', value: `${meeting.participantCount}명` },
      { label: '시작', value: formatClock(meeting.scheduledStartAt) },
    ],
  }
}

function DashboardSkeleton() {
  return (
    <div aria-label="내 팬미팅을 불러오는 중" aria-live="polite" className="grid gap-5">
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
      setError('인플루언서 계정으로 로그인해 주세요.')
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
          : Promise.reject(new TypeError('팬미팅 식별자가 올바르지 않습니다.')),
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
            : '내 팬미팅을 불러오지 못했습니다.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
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
          : '응모 결과를 발표하지 못했습니다.',
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
            내 팬미팅
          </h1>
          <p className="mt-2 text-base font-medium text-[var(--color-text-muted)]">
            가장 가까운 팬미팅 한 건입니다.
          </p>
        </div>
        {isSolo ? (
          <Button
            onClick={() => navigate('/manager/fan-meetings/new')}
            variant="outline"
          >
            새 팬미팅 만들기
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
              팬미팅 정보를 표시할 수 없어요
            </h2>
            <p className="mt-3 max-w-[48ch] text-base font-medium leading-relaxed text-[var(--color-text-body)]">
              잠시 후 페이지를 새로고침해 주세요.
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
                  참가 팬
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
                  상세 열기
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
              등록된 팬미팅이 없어요
            </h2>
            <p className="mt-3 max-w-[48ch] text-base font-medium leading-relaxed text-[var(--color-text-body)]">
              새 팬미팅을 만들거나 지난 기록을 확인해 보세요.
            </p>
          </div>
        )}
      </section>

      <p className="mt-9 border-t border-[var(--color-divider)] pt-6">
        <Button
          onClick={() => navigate('/influencer/mypage/fan-meetings')}
          variant="text"
        >
          지난 팬미팅 보기
        </Button>
      </p>

      <Dialog
        description="발표하면 응모자 전원에게 알림이 가며, 당첨 명단은 변경할 수 없습니다."
        footer={
          <>
            <Button
              disabled={publishing}
              onClick={() => setPublishTarget(undefined)}
              variant="outline"
            >
              취소
            </Button>
            <Button loading={publishing} onClick={() => void handlePublishResults()}>
              결과 발표
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!open && !publishing) setPublishTarget(undefined)
        }}
        open={Boolean(publishTarget)}
        title="응모 결과를 발표할까요?"
      >
        {publishing ? (
          <p className="text-sm font-medium text-[var(--color-text-muted)]" role="status">
            결과를 발표하는 동안 창을 닫을 수 없습니다.
          </p>
        ) : null}
      </Dialog>
    </div>
  )
}
