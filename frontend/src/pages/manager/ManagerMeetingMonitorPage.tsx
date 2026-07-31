import {
  ArrowsClockwise,
  ArrowsDownUp,
  CheckCircle,
  Clock,
  MonitorPlay,
  PhoneCall,
  Play,
  Stop,
  UserMinus,
  Warning,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/auth'
import {
  callQueueEntry,
  fetchMeetingDetail,
  fetchMeetingQueue,
  markQueueEntryNoShow,
  type MeetingQueue,
  type QueueEntry,
  type QueueStatus,
} from '../../api/fanMeetingParticipants'
import { endFanMeeting, startFanMeeting } from '../../api/meetingManagement'
import {
  changeQueuePosition,
  decideQueueChangeRequest,
  getQueueChangeRequests,
  type QueueChangeRequestSummaryResponse,
} from '../../api/queueManagement'
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

/** 팬미팅 상태 코드를 화면용 한국어 라벨로 바꾼다. */
const meetingStatusLabels: Record<string, string> = {
  DRAFT: '초안',
  PUBLISHED: '발행됨',
  APPLICATION_OPEN: '응모 접수 중',
  APPLICATION_CLOSED: '응모 마감',
  READY: '진행 준비',
  LIVE: '진행 중',
  ENDED: '종료',
  CANCELED: '취소됨',
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
  const [meetingStatus, setMeetingStatus] = useState<string>()
  const [changeRequests, setChangeRequests] = useState<QueueChangeRequestSummaryResponse[]>([])
  const [lifecycleBusy, setLifecycleBusy] = useState(false)
  const [requestBusyId, setRequestBusyId] = useState<number>()

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

  /** 대기 중(PENDING)인 순서 변경 요청 목록을 갱신한다. 실패해도 대기열 운영은 막지 않는다. */
  const loadChangeRequests = useCallback(async () => {
    if (!fanMeetingId || isPreview) return

    const token = getAuthSession()?.accessToken
    if (!token) return

    try {
      const page = await getQueueChangeRequests(fanMeetingId, { status: 'PENDING', page: 0, size: 20 }, token)
      setChangeRequests(page.content)
    } catch {
      // 조회 실패 시 기존 목록을 유지한다.
    }
  }, [fanMeetingId, isPreview])

  /** 팬미팅 현재 상태를 조회해 시작·종료 버튼 활성화에 사용한다. */
  const loadMeetingStatus = useCallback(async () => {
    if (!fanMeetingId || isPreview) return

    const token = getAuthSession()?.accessToken
    if (!token) return

    try {
      setMeetingStatus((await fetchMeetingDetail(fanMeetingId, token)).status)
    } catch {
      // 상태 조회 실패 시 버튼은 항상 사용할 수 있게 두고 서버 검증에 맡긴다.
    }
  }, [fanMeetingId, isPreview])

  useEffect(() => {
    void loadQueue()
    void loadChangeRequests()
    void loadMeetingStatus()
    if (isPreview) return

    const timer = window.setInterval(() => {
      void loadQueue()
      void loadChangeRequests()
    }, 5_000)

    return () => window.clearInterval(timer)
  }, [isPreview, loadChangeRequests, loadMeetingStatus, loadQueue])

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

  /** 팬미팅 시작·종료를 확인 후 실행하고 상태를 갱신한다. */
  async function runLifecycle(action: 'start' | 'end') {
    if (!fanMeetingId || isPreview) return

    const confirmText = action === 'start'
      ? '팬미팅을 시작할까요? 시작하면 팬미팅이 진행 중 상태로 전환됩니다.'
      : '팬미팅을 종료할까요? 종료하면 대기열 운영이 마무리됩니다.'
    if (!window.confirm(confirmText)) return

    const token = getAuthSession()?.accessToken
    if (!token) {
      setError('팬미팅 상태를 변경하려면 다시 로그인해 주세요.')
      return
    }

    setLifecycleBusy(true)
    setError(undefined)
    try {
      const updated = action === 'start'
        ? await startFanMeeting(fanMeetingId, token)
        : await endFanMeeting(fanMeetingId, token)
      setMeetingStatus(updated.status)
      await loadQueue()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '팬미팅 상태 변경에 실패했습니다.')
    } finally {
      setLifecycleBusy(false)
    }
  }

  /** 새 순번을 입력받아 대기열 항목의 순서를 변경한다. */
  async function changePosition(entry: QueueEntry) {
    const input = window.prompt(`${entry.nickname}님의 새 순번을 입력해 주세요. (1 이상)`, String(entry.position))
    if (input === null) return

    const newPosition = Number(input.trim())
    if (!Number.isInteger(newPosition) || newPosition < 1) {
      setError('순번은 1 이상의 정수로 입력해 주세요.')
      return
    }

    if (isPreview) return

    const token = getAuthSession()?.accessToken
    if (!token) {
      setError('순서를 변경하려면 다시 로그인해 주세요.')
      return
    }

    setBusyEntryId(entry.queueEntryId)
    setError(undefined)
    try {
      await changeQueuePosition(entry.queueEntryId, newPosition, token)
      await loadQueue()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '대기열 순서 변경에 실패했습니다.')
    } finally {
      setBusyEntryId(undefined)
    }
  }

  /** 팬의 순서 변경 요청을 승인하거나 거절한다. 승인 시 대기열 마지막 순서로 이동한다. */
  async function decideRequest(request: QueueChangeRequestSummaryResponse, decision: 'APPROVED' | 'REJECTED') {
    let rejectionReason: string | undefined
    if (decision === 'APPROVED') {
      if (!window.confirm(`${request.nickname}님의 순서 변경 요청을 승인할까요? 승인하면 대기열 마지막 순서로 이동합니다.`)) return
    } else {
      const input = window.prompt('거절 사유를 입력해 주세요. (선택)', '')
      if (input === null) return
      rejectionReason = input.trim() || undefined
    }

    const token = getAuthSession()?.accessToken
    if (!token) {
      setError('요청을 처리하려면 다시 로그인해 주세요.')
      return
    }

    setRequestBusyId(request.requestId)
    setError(undefined)
    try {
      await decideQueueChangeRequest(request.requestId, { decision, rejectionReason }, token)
      await Promise.all([loadQueue(), loadChangeRequests()])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '순서 변경 요청 처리에 실패했습니다.')
    } finally {
      setRequestBusyId(undefined)
    }
  }

  const counts = useMemo(() => ({
    waiting: queue.entries.filter((entry) => entry.status === 'WAITING').length,
    called: queue.entries.filter((entry) => entry.status === 'CALLED').length,
    completed: queue.entries.filter((entry) => entry.status === 'COMPLETED').length,
    noShow: queue.entries.filter((entry) => entry.status === 'NO_SHOW').length,
  }), [queue.entries])

  const startDisabled = lifecycleBusy || (meetingStatus !== undefined && ['LIVE', 'ENDED', 'CANCELED'].includes(meetingStatus))
  const endDisabled = lifecycleBusy || (meetingStatus !== undefined && meetingStatus !== 'LIVE')

  if (loading) {
    return <div className="flex min-h-[420px] items-center justify-center"><Spinner label="대기열 정보를 불러오는 중" /></div>
  }

  return (
    <div className="grid min-w-0 gap-5 pb-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--color-primary-coral)]">팬미팅 #{fanMeetingId}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-4xl font-black tracking-[-0.05em]">실시간 대기열 운영</h1>
            {meetingStatus ? <Badge variant={meetingStatus === 'LIVE' ? 'primary' : 'neutral'}>{meetingStatusLabels[meetingStatus] ?? meetingStatus}</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--color-text-secondary)]">
          <Button disabled={startDisabled} leadingIcon={<Play size={17} weight="bold" />} onClick={() => void runLifecycle('start')}>팬미팅 시작</Button>
          <Button disabled={endDisabled} leadingIcon={<Stop size={17} weight="bold" />} onClick={() => void runLifecycle('end')} variant="danger">팬미팅 종료</Button>
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
          <h2 className="text-lg font-extrabold">순서 변경 요청</h2>
          <span className="text-sm text-[var(--color-text-secondary)]">대기 중 {changeRequests.length}건</span>
        </div>
        {changeRequests.length === 0 ? (
          <div className="p-6 text-center text-sm text-[var(--color-text-secondary)]">처리 대기 중인 순서 변경 요청이 없습니다.</div>
        ) : (
          <div className="divide-y divide-[var(--color-divider)]">
            {changeRequests.map((request) => (
              <div className="grid gap-3 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" key={request.requestId}>
                <div className="flex min-w-0 items-start gap-3">
                  {request.profileImageUrl ? (
                    <img alt="" className="size-10 shrink-0 rounded-full object-cover" src={request.profileImageUrl} />
                  ) : (
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-coral-soft)] font-bold text-[var(--color-primary-coral)]">{request.nickname.slice(0, 1)}</span>
                  )}
                  <div className="min-w-0">
                    <strong>{request.nickname}</strong>
                    <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{request.requestReason}</p>
                    <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">요청 {new Date(request.requestedAt).toLocaleString('ko-KR')}{request.previousPosition !== null ? ` · 현재 ${request.previousPosition}번` : ''}</p>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button disabled={requestBusyId === request.requestId} onClick={() => void decideRequest(request, 'APPROVED')} size="sm">승인</Button>
                  <Button disabled={requestBusyId === request.requestId} onClick={() => void decideRequest(request, 'REJECTED')} size="sm" variant="danger">거절</Button>
                </div>
              </div>
            ))}
          </div>
        )}
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
                    <>
                      <Button disabled={busyEntryId === entry.queueEntryId} onClick={() => void runQueueAction(entry, 'CALL')} size="sm" leadingIcon={<MonitorPlay size={16} />}>호출</Button>
                      <Button disabled={busyEntryId === entry.queueEntryId} onClick={() => void changePosition(entry)} size="sm" variant="secondary" leadingIcon={<ArrowsDownUp size={16} />}>순서 변경</Button>
                    </>
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
