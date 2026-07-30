import {
  ArrowsClockwise,
  CheckCircle,
  Clock,
  MonitorPlay,
  PhoneCall,
  UserMinus,
  Warning,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/auth'
import {
  callQueueEntry,
  fetchMeetingQueue,
  markQueueEntryNoShow,
  type MeetingQueue,
  type QueueEntry,
  type QueueStatus,
} from '../../api/fanMeetingParticipants'
import { AlertBanner, Badge, Button, Card, Spinner } from '../../components'

const previewQueue: MeetingQueue = {
  currentCall: {
    callSessionId: '7001',
    participantId: 'p-1',
    nickname: '별하늘',
    startedAt: '2026-07-29T19:30:00',
    endsAt: '2026-07-29T19:32:00',
  },
  entries: [
    { queueEntryId: 'q-1', participantId: 'p-1', fanId: 'f-1', nickname: '별하늘', position: 1, status: 'IN_CALL', callAttemptCount: 1 },
    { queueEntryId: 'q-2', participantId: 'p-2', fanId: 'f-2', nickname: '몽글이', position: 2, status: 'CALLED', callAttemptCount: 1 },
    { queueEntryId: 'q-3', participantId: 'p-3', fanId: 'f-3', nickname: '바람처럼', position: 3, status: 'WAITING', callAttemptCount: 0 },
    { queueEntryId: 'q-4', participantId: 'p-4', fanId: 'f-4', nickname: '소다빛', position: 4, status: 'COMPLETED', callAttemptCount: 1 },
  ],
}

const statusLabels: Record<QueueStatus, string> = {
  WAITING: '대기',
  CALLED: '호출됨',
  IN_CALL: '통화 중',
  COMPLETED: '완료',
  NO_SHOW: '노쇼',
  SKIPPED: '건너뜀',
  REMOVED: '제외',
}

function statusBadge(status: QueueStatus): 'primary' | 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'IN_CALL') return 'primary'
  if (status === 'COMPLETED') return 'success'
  if (status === 'CALLED') return 'warning'
  if (status === 'NO_SHOW' || status === 'REMOVED') return 'danger'
  return 'neutral'
}

export function ManagerMeetingMonitorPage() {
  const { fanMeetingId } = useParams<{ fanMeetingId: string }>()
  const [searchParams] = useSearchParams()
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === '1'
  const [queue, setQueue] = useState<MeetingQueue>({ entries: [] })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyEntryId, setBusyEntryId] = useState<string>()
  const [error, setError] = useState<string>()

  const loadQueue = useCallback(async (showSpinner = false) => {
    if (!fanMeetingId) {
      setError('팬미팅 식별자가 없습니다.')
      setLoading(false)
      return
    }

    if (isPreview) {
      setQueue(previewQueue)
      setLoading(false)
      return
    }

    const token = getAuthSession()?.accessToken
    if (!token) {
      setError('로그인 후 영상 모니터링 화면을 이용할 수 있습니다.')
      setLoading(false)
      return
    }

    if (showSpinner) setRefreshing(true)
    try {
      setQueue(await fetchMeetingQueue(fanMeetingId, token))
      setError(undefined)
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : '대기열 정보를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [fanMeetingId, isPreview])

  useEffect(() => {
    void loadQueue()
    if (isPreview) return

    const timer = window.setInterval(() => {
      void loadQueue()
    }, 5_000)

    return () => window.clearInterval(timer)
  }, [isPreview, loadQueue])

  async function runQueueAction(entry: QueueEntry, action: 'CALL' | 'NO_SHOW') {
    if (isPreview) {
      setQueue((current) => ({
        ...current,
        entries: current.entries.map((item) => item.queueEntryId === entry.queueEntryId
          ? { ...item, status: action === 'CALL' ? 'CALLED' : 'NO_SHOW' }
          : item),
      }))
      return
    }

    const token = getAuthSession()?.accessToken
    if (!token) {
      setError('대기열을 운영하려면 다시 로그인해 주세요.')
      return
    }

    setBusyEntryId(entry.queueEntryId)
    setError(undefined)
    try {
      if (action === 'CALL') {
        await callQueueEntry(entry.queueEntryId, token)
      } else {
        await markQueueEntryNoShow(entry.queueEntryId, token)
      }
      await loadQueue()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '대기열 상태 변경에 실패했습니다.')
    } finally {
      setBusyEntryId(undefined)
    }
  }

  const counts = useMemo(() => ({
    waiting: queue.entries.filter((entry) => entry.status === 'WAITING').length,
    called: queue.entries.filter((entry) => entry.status === 'CALLED').length,
    completed: queue.entries.filter((entry) => entry.status === 'COMPLETED').length,
    noShow: queue.entries.filter((entry) => entry.status === 'NO_SHOW').length,
  }), [queue.entries])

  if (loading) {
    return <div className="flex min-h-[420px] items-center justify-center"><Spinner label="대기열 정보를 불러오는 중" /></div>
  }

  return (
    <div className="grid min-w-0 gap-5 pb-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--color-primary-coral)]">팬미팅 #{fanMeetingId}</p>
          <h1 className="mt-2 text-4xl font-black tracking-[-0.05em]">실시간 대기열 운영</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--color-text-secondary)]">
          <Button disabled={refreshing} onClick={() => void loadQueue(true)} variant="ghost" leadingIcon={<ArrowsClockwise size={18} weight="bold" />}>
            {refreshing ? '갱신 중…' : '새로고침'}
          </Button>
          <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-500" />자동 갱신: 5초</span>
        </div>
      </header>

      {isPreview ? <AlertBanner title="개발 미리보기" variant="warning">대기열 상태 변경은 현재 화면에만 반영됩니다.</AlertBanner> : null}
      {error ? <AlertBanner title="대기열 작업을 완료할 수 없습니다" variant="error">{error}</AlertBanner> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={<Clock size={20} />} label="대기" value={counts.waiting} />
        <SummaryCard icon={<PhoneCall size={20} />} label="호출됨" value={counts.called} />
        <SummaryCard icon={<CheckCircle size={20} />} label="완료" value={counts.completed} />
        <SummaryCard icon={<UserMinus size={20} />} label="노쇼" value={counts.noShow} />
      </div>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">CURRENT CALL</p>
            {queue.currentCall ? (
              <>
                <h2 className="mt-2 text-2xl font-black">{queue.currentCall.nickname}</h2>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">통화 세션 #{queue.currentCall.callSessionId}</p>
              </>
            ) : (
              <h2 className="mt-2 text-2xl font-black">현재 진행 중인 통화가 없습니다</h2>
            )}
          </div>
          {queue.currentCall ? (
            <Link className="inline-flex min-h-[var(--control-height)] items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-danger)] px-[var(--control-padding-inline)] text-sm font-semibold text-white" to={`/manager/fan-meetings/${encodeURIComponent(fanMeetingId ?? '')}/monitor/risk?callSessionId=${encodeURIComponent(queue.currentCall.callSessionId)}`}>
              <Warning size={18} weight="bold" />통화 강제 종료
            </Link>
          ) : null}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--color-divider)] p-5">
          <h2 className="text-lg font-extrabold">대기열</h2>
          <span className="text-sm text-[var(--color-text-secondary)]">총 {queue.entries.length}명</span>
        </div>
        {queue.entries.length === 0 ? (
          <div className="p-8 text-center text-[var(--color-text-secondary)]">현재 대기열에 참가자가 없습니다.</div>
        ) : (
          <div className="divide-y divide-[var(--color-divider)]">
            {queue.entries.map((entry) => (
              <div className="grid gap-4 p-5 sm:grid-cols-[60px_minmax(0,1fr)_110px_auto] sm:items-center" key={entry.queueEntryId}>
                <span className="flex size-10 items-center justify-center rounded-full bg-[var(--color-surface-page)] font-black">{entry.position}</span>
                <div>
                  <strong>{entry.nickname}</strong>
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">호출 시도 {entry.callAttemptCount}회</p>
                </div>
                <Badge variant={statusBadge(entry.status)}>{statusLabels[entry.status]}</Badge>
                <div className="flex flex-wrap justify-end gap-2">
                  {entry.status === 'WAITING' ? (
                    <Button disabled={busyEntryId === entry.queueEntryId} onClick={() => void runQueueAction(entry, 'CALL')} size="sm" leadingIcon={<MonitorPlay size={16} />}>호출</Button>
                  ) : null}
                  {entry.status === 'CALLED' ? (
                    <Button disabled={busyEntryId === entry.queueEntryId} onClick={() => void runQueueAction(entry, 'NO_SHOW')} size="sm" variant="danger" leadingIcon={<UserMinus size={16} />}>노쇼 처리</Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function SummaryCard({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">{icon}{label}</div>
      <p className="mt-3 text-3xl font-black">{value}<span className="ml-1 text-sm font-semibold">명</span></p>
    </Card>
  )
}
