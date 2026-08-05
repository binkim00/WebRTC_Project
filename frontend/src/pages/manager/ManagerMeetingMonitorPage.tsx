import {
  ArrowsClockwise,
  ArrowsDownUp,
  CheckCircle,
  Clock,
  MonitorPlay,
  NotePencil,
  PhoneCall,
  Play,
  Stop,
  UserMinus,
  VideoCamera,
  Warning,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/auth'
import {
  callQueueEntry,
  fetchMeetingDetail,
  fetchMeetingQueue,
  fetchParticipants,
  markQueueEntryNoShow,
  type MeetingQueue,
  type QueueEntry,
  type QueueStatus,
} from '../../api/fanMeetingParticipants'
import {
  endFanMeeting,
  isWaitingRoomOpen,
  openWaitingRoomImmediately,
  startFanMeetingWithOpenWaitingRoom,
  transitionFanMeetingImmediately,
} from '../../api/meetingManagement'
import {
  changeQueuePosition,
  decideQueueChangeRequest,
  getQueueChangeRequests,
  type QueueChangeRequestSummaryResponse,
} from '../../api/queueManagement'
import { isQueueNotInitialized } from '../../api/queue'
import { AlertBanner, Badge, Button, Card, Spinner } from '../../components'
import { MeetingWrapUp } from '../../components/call/MeetingWrapUp'
import { getAvailableActions } from './meetingLifecycle'
import { translate, useTranslation } from '../../i18n'

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

const statusLabels = (): Record<QueueStatus, string> => ({
  WAITING: translate('managerMeetingMonitorPage.t81'),
  CALLED: translate('managerMeetingMonitorPage.t82'),
  IN_CALL: translate('managerMeetingMonitorPage.t83'),
  COMPLETED: translate('managerMeetingMonitorPage.t84'),
  NO_SHOW: translate('managerMeetingMonitorPage.t85'),
  SKIPPED: translate('managerMeetingMonitorPage.t86'),
  REMOVED: translate('managerMeetingMonitorPage.t87'),
})

/** 팬미팅 상태 코드를 화면용 한국어 라벨로 바꾼다. */
const meetingStatusLabels = (): Record<string, string> => ({
  DRAFT: translate('managerMeetingMonitorPage.t88'),
  PUBLISHED: translate('managerMeetingMonitorPage.t89'),
  APPLICATION_OPEN: translate('managerMeetingMonitorPage.t90'),
  APPLICATION_CLOSED: translate('managerMeetingMonitorPage.t91'),
  READY: translate('managerMeetingMonitorPage.t92'),
  LIVE: translate('managerMeetingMonitorPage.t93'),
  ENDED: translate('managerMeetingMonitorPage.t94'),
  CANCELED: translate('managerMeetingMonitorPage.t95'),
})

function statusBadge(status: QueueStatus): 'primary' | 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'IN_CALL') return 'primary'
  if (status === 'COMPLETED') return 'success'
  if (status === 'CALLED') return 'warning'
  if (status === 'NO_SHOW' || status === 'REMOVED') return 'danger'
  return 'neutral'
}

export function ManagerMeetingMonitorPage() {
  const { t } = useTranslation()
  const { fanMeetingId } = useParams<{ fanMeetingId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === '1'
  const session = getAuthSession()
  const isSoloInfluencer = session?.role === 'SOLO_INFLUENCER'
  const [queue, setQueue] = useState<MeetingQueue>({ entries: [] })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyEntryId, setBusyEntryId] = useState<string>()
  const [error, setError] = useState<string>()
  const [meetingStatus, setMeetingStatus] = useState<string>()
  const [scheduledStartAt, setScheduledStartAt] = useState<string>()
  const [participantCount, setParticipantCount] = useState<number>()
  const [statusError, setStatusError] = useState<string>()
  const [changeRequests, setChangeRequests] = useState<QueueChangeRequestSummaryResponse[]>([])
  const [lifecycleBusy, setLifecycleBusy] = useState(false)
  const [requestBusyId, setRequestBusyId] = useState<number>()
  // 대기열 오픈 안내는 실패가 아니라 경고이므로 loadQueue가 지우는 error와 분리해 보관한다.
  const [waitingRoomWarning, setWaitingRoomWarning] = useState<string>()
  // 대기열이 아직 없거나 종료로 정리된 상태를 오류와 구분해 안내로만 보여 준다.
  // 문구는 렌더 시점에 팬미팅 상태로 결정한다. 대기열 조회와 상태 조회가 병렬로 나가므로
  // catch 안에서 문구를 확정하면 meetingStatus가 아직 undefined인 상태로 잘못 판단할 수 있다.
  const [queueUnavailable, setQueueUnavailable] = useState(false)

  // 폴링과 수동 새로고침이 겹치면 이전 요청을 취소해 오래된 응답이 최신 화면을 덮지 않게 한다.
  const queueRequestIdRef = useRef(0)
  const queueAbortRef = useRef<AbortController | undefined>(undefined)
  const changeRequestIdRef = useRef(0)
  const changeRequestAbortRef = useRef<AbortController | undefined>(undefined)
  const statusRequestIdRef = useRef(0)
  const statusAbortRef = useRef<AbortController | undefined>(undefined)

  // 상세 화면과 같은 상태·참가자·조기 시작 규칙으로 시작/종료 가능 여부를 계산한다.
  const lifecycleActions = getAvailableActions({
    status: meetingStatus,
    scheduledStartAt,
    participantCount,
  })

  const loadQueue = useCallback(async (showSpinner = false) => {
    if (!fanMeetingId) {
      setError(t('managerMeetingMonitorPage.t45'))
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
      setError(t('managerMeetingMonitorPage.t46'))
      setLoading(false)
      return
    }

    const requestId = queueRequestIdRef.current + 1
    queueRequestIdRef.current = requestId
    queueAbortRef.current?.abort()
    const controller = new AbortController()
    queueAbortRef.current = controller

    if (showSpinner) setRefreshing(true)
    try {
      const response = await fetchMeetingQueue(fanMeetingId, token, controller.signal)
      if (controller.signal.aborted || requestId !== queueRequestIdRef.current) return
      setQueue(response)
      setError(undefined)
      setQueueUnavailable(false)
    } catch (reason) {
      if (controller.signal.aborted || requestId !== queueRequestIdRef.current) return
      // 대기열을 아직 열지 않았거나, 팬미팅 종료 처리가 Redis 대기열을 정리한 상태다.
      // 운영 작업이 실패한 게 아니므로 오류 배너 대신 안내로 보여 주고 빈 대기열로 둔다.
      // (종료 직후 이 오류가 "대기열 작업을 완료할 수 없습니다"로 뜨던 문제를 막는다.)
      if (isQueueNotInitialized(reason)) {
        setQueue({ entries: [] })
        setError(undefined)
        setQueueUnavailable(true)
        if (reason instanceof ApiError && reason.code === 'FAN_MEETING_ALREADY_ENDED') {
          setMeetingStatus('ENDED')
        }
        return
      }
      setQueueUnavailable(false)
      setError(reason instanceof ApiError ? reason.message : t('managerMeetingMonitorPage.t47'))
    } finally {
      if (requestId === queueRequestIdRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fanMeetingId, isPreview])

  /** 대기 중(PENDING)인 순서 변경 요청 목록을 갱신한다. 실패해도 대기열 운영은 막지 않는다. */
  const loadChangeRequests = useCallback(async () => {
    if (!fanMeetingId || isPreview) return

    const token = getAuthSession()?.accessToken
    if (!token) return

    const requestId = changeRequestIdRef.current + 1
    changeRequestIdRef.current = requestId
    changeRequestAbortRef.current?.abort()
    const controller = new AbortController()
    changeRequestAbortRef.current = controller

    try {
      const page = await getQueueChangeRequests(
        fanMeetingId,
        { status: 'PENDING', page: 0, size: 20 },
        token,
        controller.signal,
      )
      if (controller.signal.aborted || requestId !== changeRequestIdRef.current) return
      setChangeRequests(page.content)
    } catch {
      // 조회 실패 시 기존 목록을 유지한다. 취소된 이전 요청도 화면 상태를 바꾸지 않는다.
    }
  }, [fanMeetingId, isPreview])

  /** 팬미팅 상태와 확정 참가자 수를 함께 조회해 시작·종료 버튼을 안전하게 판정한다. */
  const loadMeetingStatus = useCallback(async () => {
    if (!fanMeetingId) {
      setMeetingStatus(undefined)
      setStatusError(t('managerMeetingMonitorPage.t48'))
      return
    }

    if (isPreview) {
      setMeetingStatus('LIVE')
      setScheduledStartAt('2026-07-29T19:00:00+09:00')
      setParticipantCount(previewQueue.entries.length)
      setStatusError(undefined)
      return
    }

    const token = getAuthSession()?.accessToken
    if (!token) {
      setMeetingStatus(undefined)
      setStatusError(t('managerMeetingMonitorPage.t49'))
      return
    }

    const requestId = statusRequestIdRef.current + 1
    statusRequestIdRef.current = requestId
    statusAbortRef.current?.abort()
    const controller = new AbortController()
    statusAbortRef.current = controller

    try {
      const [detailResult, participantsResult] = await Promise.allSettled([
        fetchMeetingDetail(fanMeetingId, token, controller.signal),
        fetchParticipants(fanMeetingId, { page: 0, size: 1 }, token, controller.signal),
      ])
      if (controller.signal.aborted || requestId !== statusRequestIdRef.current) return
      if (detailResult.status === 'rejected') throw detailResult.reason

      setMeetingStatus(detailResult.value.status)
      setScheduledStartAt(detailResult.value.scheduledStartAt)
      if (participantsResult.status === 'fulfilled') {
        setParticipantCount(participantsResult.value.totalElements)
        setStatusError(undefined)
      } else {
        // 참가자 수가 없으면 시작만 보수적으로 차단하고, LIVE 상태의 종료는 계속 허용한다.
        setParticipantCount(undefined)
        setStatusError(
          detailResult.value.status === 'READY'
            ? t('managerMeetingMonitorPage.t50')
            : undefined,
        )
      }
    } catch (reason) {
      if (controller.signal.aborted || requestId !== statusRequestIdRef.current) return
      setMeetingStatus(undefined)
      setScheduledStartAt(undefined)
      setParticipantCount(undefined)
      setStatusError(
        reason instanceof ApiError
          ? reason.message
          : t('managerMeetingMonitorPage.t51'),
      )
    }
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fanMeetingId, isPreview])

  /** 세 조회가 모두 끝난 뒤 다음 폴링을 예약해 느린 네트워크에서도 요청이 중첩되지 않게 한다. */
  const refreshMonitor = useCallback(async (showSpinner = false) => {
    await Promise.allSettled([
      loadQueue(showSpinner),
      loadChangeRequests(),
      loadMeetingStatus(),
    ])
  }, [loadChangeRequests, loadMeetingStatus, loadQueue])

  useEffect(() => {
    let stopped = false
    let timer: number | undefined

    const poll = async () => {
      await refreshMonitor()
      if (!stopped && !isPreview) timer = window.setTimeout(() => void poll(), 5_000)
    }
    void poll()

    return () => {
      stopped = true
      if (timer !== undefined) window.clearTimeout(timer)
      queueAbortRef.current?.abort()
      changeRequestAbortRef.current?.abort()
      statusAbortRef.current?.abort()
    }
  }, [isPreview, refreshMonitor])

  async function runQueueAction(entry: QueueEntry, action: 'CALL' | 'NO_SHOW') {
    // 한 요청이 끝나기 전에 다른 팬을 조작하면 서버 상태 순서가 뒤집힐 수 있으므로 직렬화한다.
    if (busyEntryId !== undefined || requestBusyId !== undefined) return
    if (!isPreview && (meetingStatus !== 'LIVE' || statusError)) {
      // 백엔드 호출 API가 팬미팅 상태를 검사하지 않으므로 프론트에서 LIVE를 확인해 조기 세션 생성을 막는다.
      setError(statusError ?? t('managerMeetingMonitorPage.t52'))
      return
    }

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
      setError(t('managerMeetingMonitorPage.t53'))
      return
    }

    setBusyEntryId(entry.queueEntryId)
    setError(undefined)
    try {
      if (action === 'CALL') {
        // 호출 응답의 callSessionId를 실제 통화 입장 경로에 연결한다.
        // 일반 매니저는 기존처럼 모니터에 남고, 직접 통화하는 솔로 인플루언서만 바로 입장한다.
        const response = await callQueueEntry(entry.queueEntryId, token)
        if (isSoloInfluencer && fanMeetingId) {
          navigate(
            `/influencer/fan-meetings/${encodeURIComponent(fanMeetingId)}/calls/${encodeURIComponent(response.callSessionId)}`,
          )
          return
        }
      } else {
        await markQueueEntryNoShow(entry.queueEntryId, token)
      }
      await loadQueue()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('managerMeetingMonitorPage.t54'))
    } finally {
      setBusyEntryId(undefined)
    }
  }

  /** 팬미팅 시작·종료를 확인 후 실행하고 상태를 갱신한다. */
  async function runLifecycle(action: 'start' | 'startNow' | 'openQueue' | 'end') {
    if (!fanMeetingId || isPreview) return

    const actionAllowed = action === 'openQueue'
      // 시작 후에야 오픈이 늦은 것을 알아차리는 경우가 있어 LIVE에서도 수동 오픈을 남겨 둔다.
      ? meetingStatus === 'READY' || meetingStatus === 'LIVE'
      : action === 'start'
      ? lifecycleActions.canStart
      : action === 'startNow'
        ? lifecycleActions.canStartNow && !lifecycleActions.canStart
        : lifecycleActions.canEnd
    if (!actionAllowed || statusError) {
      setError(
        action === 'start' || action === 'startNow'
          ? lifecycleActions.startBlockedReason ?? statusError ?? t('managerMeetingMonitorPage.t55')
          : statusError ?? t('managerMeetingMonitorPage.t56'),
      )
      return
    }

    const confirmText = action === 'openQueue'
      ? t('managerMeetingMonitorPage.t57')
      : action === 'start'
      ? t('managerMeetingMonitorPage.t58')
      : action === 'startNow'
        ? t('managerMeetingMonitorPage.t59')
        : t('managerMeetingMonitorPage.t60')
    if (!window.confirm(confirmText)) return

    const token = getAuthSession()?.accessToken
    if (!token) {
      setError(t('managerMeetingMonitorPage.t61'))
      return
    }

    setLifecycleBusy(true)
    setError(undefined)
    try {
      const updated = action === 'openQueue'
        ? await openWaitingRoomImmediately(fanMeetingId, token)
        : action === 'start'
        // POST /start는 상태만 LIVE로 바꾸고 대기실 오픈 시각은 그대로 두므로,
        // 시작만 하면 오픈 예정 시각까지 팬이 입장할 수 없다. 오픈을 함께 처리한다.
        ? await startFanMeetingWithOpenWaitingRoom(fanMeetingId, token)
        : action === 'startNow'
          ? await transitionFanMeetingImmediately(
              fanMeetingId,
              'READY',
              'LIVE',
              token,
              // 예정 시작 시각을 넘겨야 조기 시작 허용 폭(earlyStartMinutes)을 계산해
              // 정식 API만으로 즉시 시작할 수 있다. 없으면 시연용 경로로 떨어진다.
              { scheduledStartAt },
            )
          : await endFanMeeting(fanMeetingId, token)
      setMeetingStatus(updated.status)
      // 시작했는데 대기열이 아직 닫혀 있으면 팬은 입장 시 409로 막힌다. 조용히 넘기지 않고 알린다.
      setWaitingRoomWarning(
        action !== 'end' && !isWaitingRoomOpen(updated.operation.queueOpenAt)
          ? t('managerMeetingMonitorPage.t62')
          : undefined,
      )
      if (action === 'end') {
        // 종료 처리로 백엔드가 Redis 대기열을 삭제하므로, 종료 직후 대기열을
        // 다시 조회하면 QUEUE_NOT_INITIALIZED가 반환된다. 이를 운영 오류로
        // 표시하지 않고 종료된 팬미팅의 정상 상태로 즉시 반영한다.
        setQueue({ entries: [] })
        setQueueUnavailable(true)
        setError(undefined)
        await loadMeetingStatus()
      } else {
        await Promise.all([loadQueue(), loadMeetingStatus()])
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('managerMeetingMonitorPage.t63'))
    } finally {
      setLifecycleBusy(false)
    }
  }

  /** 새 순번을 입력받아 대기열 항목의 순서를 변경한다. */
  async function changePosition(entry: QueueEntry) {
    if (busyEntryId !== undefined || requestBusyId !== undefined) return

    const input = window.prompt(t('managerMeetingMonitorPage.t96', { p0: entry.nickname }), String(entry.position))
    if (input === null) return

    const newPosition = Number(input.trim())
    if (!Number.isInteger(newPosition) || newPosition < 1) {
      setError(t('managerMeetingMonitorPage.t64'))
      return
    }

    if (isPreview) return

    const token = getAuthSession()?.accessToken
    if (!token) {
      setError(t('managerMeetingMonitorPage.t65'))
      return
    }

    setBusyEntryId(entry.queueEntryId)
    setError(undefined)
    try {
      await changeQueuePosition(entry.queueEntryId, newPosition, token)
      await loadQueue()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('managerMeetingMonitorPage.t66'))
    } finally {
      setBusyEntryId(undefined)
    }
  }

  /** 팬의 순서 변경 요청을 승인하거나 거절한다. 승인 시 대기열 마지막 순서로 이동한다. */
  async function decideRequest(request: QueueChangeRequestSummaryResponse, decision: 'APPROVED' | 'REJECTED') {
    if (busyEntryId !== undefined || requestBusyId !== undefined) return

    // 거절 사유는 받지 않는다. 백엔드 DTO가 rejectionReason을 받기는 하지만
    // "현재 스키마에는 저장하지 않는다"고 명시되어 있어 값이 그대로 버려지고,
    // 팬에게 전달할 알림 경로도 아직 없다. 사유를 물으면 전달된다고 오해하게 되므로
    // 백엔드가 저장·알림을 지원할 때까지 승인과 같은 확인만 받는다.
    if (decision === 'APPROVED') {
      if (!window.confirm(t('managerMeetingMonitorPage.t97', { p0: request.nickname }))) return
    } else if (!window.confirm(t('managerMeetingMonitorPage.t98', { p0: request.nickname }))) {
      return
    }

    const token = getAuthSession()?.accessToken
    if (!token) {
      setError(t('managerMeetingMonitorPage.t67'))
      return
    }

    setRequestBusyId(request.requestId)
    setError(undefined)
    try {
      await decideQueueChangeRequest(request.requestId, { decision }, token)
      await Promise.all([loadQueue(), loadChangeRequests()])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('managerMeetingMonitorPage.t68'))
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

  const queueMutationBusy = busyEntryId !== undefined || requestBusyId !== undefined
  const queueCallDisabled =
    queueMutationBusy || lifecycleBusy || Boolean(statusError) || meetingStatus !== 'LIVE'
  const startDisabled = lifecycleBusy || queueMutationBusy || Boolean(statusError) || !lifecycleActions.canStart
  const immediateStartDisabled =
    lifecycleBusy ||
    queueMutationBusy ||
    Boolean(statusError) ||
    !lifecycleActions.canStartNow ||
    lifecycleActions.canStart
  /**
   * 대기열 조회가 409로 실패한 이유를 팬미팅 상태로 구분해 정확히 안내한다.
   *
   * 백엔드는 Redis 대기열 키가 없으면 원인을 구분하지 않고 QUEUE_NOT_INITIALIZED 하나만 준다.
   * 그런데 키가 없는 상황은 성격이 전혀 다른 셋으로 갈린다.
   *   1. 아직 추첨을 하지 않았다 (대기열은 추첨 시 initializeAfterDraw로 만들어진다)
   *   2. 팬미팅이 종료되어 정리됐다 (종료 처리가 clearMeeting으로 키를 지운다)
   *   3. 팬미팅이 취소됐다
   * 이전에는 셋을 "대기열이 없습니다. 팬미팅을 종료했거나 아직 대기열을 열지 않았습니다."
   * 한 문장으로 뭉쳐, 종료도 아니고 대기열 문제도 아닌 상황에서 잘못된 안내를 보여 줬다.
   *
   * 참가자는 추첨으로 생성되므로 participantCount === 0을 '추첨 전'의 근거로 쓴다.
   */
  const queueUnavailableNotice = useMemo(() => {
    if (!queueUnavailable) return undefined

    if (meetingStatus === 'ENDED') {
      return {
        title: t('managerMeetingMonitorPage.t69'),
        body: t('managerMeetingMonitorPage.t70'),
      }
    }
    if (meetingStatus === 'CANCELED') {
      return {
        title: t('managerMeetingMonitorPage.t71'),
        body: t('managerMeetingMonitorPage.t72'),
      }
    }
    if (participantCount === 0) {
      return {
        title: t('managerMeetingMonitorPage.t73'),
        body: t('managerMeetingMonitorPage.t74'),
      }
    }
    return {
      title: t('managerMeetingMonitorPage.t75'),
      body: t('managerMeetingMonitorPage.t76'),
    }
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingStatus, participantCount, queueUnavailable])

  const endDisabled = lifecycleBusy || queueMutationBusy || Boolean(statusError) || !lifecycleActions.canEnd
  const encodedMeetingId = encodeURIComponent(fanMeetingId ?? '')
  const currentCallEntry = queue.currentCall
    ? queue.entries.find((entry) => entry.participantId === queue.currentCall?.participantId)
    : undefined
  const consoleLinkClass = 'inline-flex min-h-[var(--control-height)] items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-divider)] bg-[var(--color-surface-panel)] px-[var(--control-padding-inline)] text-sm font-semibold transition-colors hover:border-[var(--color-primary-coral)] hover:text-[var(--color-primary-coral)]'

  /**
   * 마무리 화면에 보여 줄 진행 결과다.
   *
   * 종료 처리가 대기열을 비우기 전에 마지막으로 읽어 둔 항목으로 집계한다. 대기열이 이미
   * 비었으면 숫자를 보여 주지 않는다(0명으로 잘못 안내하지 않기 위해).
   */
  const wrapUpTally = queue.entries.length
    ? {
        completed: queue.entries.filter((entry) => entry.status === 'COMPLETED').length,
        missed: queue.entries.filter(
          (entry) => entry.status === 'NO_SHOW' || entry.status === 'SKIPPED',
        ).length,
      }
    : undefined

  /** 솔로 운영 콘솔에서 팬의 메모·통화 기록으로 바로 이동할 수 있는 경로를 만든다. */
  function fanRecordPath(entry: QueueEntry): string {
    const currentCallSessionId = entry.participantId === queue.currentCall?.participantId
      ? queue.currentCall.callSessionId
      : undefined
    const callSessionQuery = currentCallSessionId
      ? `&callSessionId=${encodeURIComponent(currentCallSessionId)}`
      : ''
    return `/influencer/fan-meetings/${encodedMeetingId}/fans/${encodeURIComponent(entry.fanId)}/records?tab=memo${callSessionQuery}`
  }

  if (loading) {
    return <div className="flex min-h-[420px] items-center justify-center"><Spinner label={t('managerMeetingMonitorPage.t1')} /></div>
  }

  // 매니저가 종료 버튼을 눌러 팬미팅이 끝났으면, 인플루언서가 정상 종료했을 때와 같은
  // 마무리 화면을 보여 준다. 이전에는 종료 후에도 빈 대기열이 남은 모니터 화면에 머물러
  // 무엇이 끝났고 다음에 무엇을 할지 알 수 없었다.
  if (meetingStatus === 'ENDED' || meetingStatus === 'CANCELED') {
    return (
      <MeetingWrapUp
        meetingId={fanMeetingId ?? ''}
        reason={meetingStatus}
        tally={wrapUpTally}
      />
    )
  }

  return (
    <div className="grid min-w-0 gap-5 pb-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--color-primary-coral)]">{t('managerMeetingMonitorPage.t2')}{fanMeetingId}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-4xl font-black tracking-[-0.05em]">
              {isSoloInfluencer ? t('managerMeetingMonitorPage.t77') : t('managerMeetingMonitorPage.t78')}
            </h1>
            {meetingStatus ? <Badge variant={meetingStatus === 'LIVE' ? 'primary' : 'neutral'}>{meetingStatusLabels()[meetingStatus] ?? meetingStatus}</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--color-text-secondary)]">
          <Button
            disabled={startDisabled}
            leadingIcon={<Play size={17} weight="bold" />}
            onClick={() => void runLifecycle('start')}
            title={lifecycleActions.startBlockedReason ?? statusError}
          >
            {t('managerMeetingMonitorPage.t3')}
          </Button>
          {meetingStatus === 'READY' || meetingStatus === 'LIVE' ? (
            <Button
              disabled={lifecycleBusy || Boolean(statusError)}
              leadingIcon={<Clock size={17} weight="bold" />}
              onClick={() => void runLifecycle('openQueue')}
              title={t('managerMeetingMonitorPage.t4')}
              variant="secondary"
            >
              {t('managerMeetingMonitorPage.t5')}
            </Button>
          ) : null}
          {lifecycleActions.canStartNow && !lifecycleActions.canStart ? (
            <Button
              disabled={immediateStartDisabled}
              leadingIcon={<Play size={17} weight="bold" />}
              onClick={() => void runLifecycle('startNow')}
              title={t('managerMeetingMonitorPage.t6')}
              variant="secondary"
            >
              {t('managerMeetingMonitorPage.t7')}
            </Button>
          ) : null}
          <Button disabled={endDisabled} leadingIcon={<Stop size={17} weight="bold" />} onClick={() => void runLifecycle('end')} variant="danger">{t('managerMeetingMonitorPage.t8')}</Button>
          <Button disabled={refreshing} onClick={() => void refreshMonitor(true)} variant="ghost" leadingIcon={<ArrowsClockwise size={18} weight="bold" />}>
            {refreshing ? t('managerMeetingMonitorPage.t79') : t('managerMeetingMonitorPage.t80')}
          </Button>
          <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-500" />{t('managerMeetingMonitorPage.t9')}</span>
        </div>
      </header>

      {isPreview ? <AlertBanner title={t('managerMeetingMonitorPage.t10')} variant="warning">{t('managerMeetingMonitorPage.t11')}</AlertBanner> : null}
      {statusError ? <AlertBanner title={t('managerMeetingMonitorPage.t12')} variant="warning">{statusError}</AlertBanner> : null}
      {waitingRoomWarning ? <AlertBanner title={t('managerMeetingMonitorPage.t13')} variant="warning">{waitingRoomWarning}</AlertBanner> : null}
      {queueUnavailableNotice ? (
        <AlertBanner title={queueUnavailableNotice.title} variant="info">
          {queueUnavailableNotice.body}
        </AlertBanner>
      ) : null}
      {error ? <AlertBanner title={t('managerMeetingMonitorPage.t14')} variant="error">{error}</AlertBanner> : null}

      {isSoloInfluencer ? (
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-extrabold">{t('managerMeetingMonitorPage.t15')}</h2>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                {t('managerMeetingMonitorPage.t16')}
              </p>
            </div>
            <Link className={consoleLinkClass} to={`/influencer/fan-meetings/${encodedMeetingId}/ready`}>
              <VideoCamera aria-hidden size={18} weight="bold" />{t('managerMeetingMonitorPage.t17')}
            </Link>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={<Clock size={20} />} label={t('managerMeetingMonitorPage.t18')} value={counts.waiting} />
        <SummaryCard icon={<PhoneCall size={20} />} label={t('managerMeetingMonitorPage.t19')} value={counts.called} />
        <SummaryCard icon={<CheckCircle size={20} />} label={t('managerMeetingMonitorPage.t20')} value={counts.completed} />
        <SummaryCard icon={<UserMinus size={20} />} label={t('managerMeetingMonitorPage.t21')} value={counts.noShow} />
      </div>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">CURRENT CALL</p>
            {queue.currentCall ? (
              <>
                <h2 className="mt-2 text-2xl font-black">{queue.currentCall.nickname}</h2>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{t('managerMeetingMonitorPage.t22')}{queue.currentCall.callSessionId}</p>
              </>
            ) : (
              <h2 className="mt-2 text-2xl font-black">{t('managerMeetingMonitorPage.t23')}</h2>
            )}
          </div>
          {queue.currentCall ? (
            <div className="flex flex-wrap justify-end gap-2">
              {isSoloInfluencer ? (
                <Link
                  className="inline-flex min-h-[var(--control-height)] items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-primary-coral)] px-[var(--control-padding-inline)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-coral-hover)]"
                  to={`/influencer/fan-meetings/${encodedMeetingId}/calls/${encodeURIComponent(queue.currentCall.callSessionId)}`}
                >
                  <VideoCamera aria-hidden size={18} weight="bold" />{t('managerMeetingMonitorPage.t24')}
                </Link>
              ) : null}
              {isSoloInfluencer && currentCallEntry ? (
                <Link className={consoleLinkClass} to={fanRecordPath(currentCallEntry)}>
                  <NotePencil aria-hidden size={18} weight="bold" />{t('managerMeetingMonitorPage.t25')}
                </Link>
              ) : null}
              <Link className="inline-flex min-h-[var(--control-height)] items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-danger)] px-[var(--control-padding-inline)] text-sm font-semibold text-white" to={`/manager/fan-meetings/${encodedMeetingId}/monitor/risk?callSessionId=${encodeURIComponent(queue.currentCall.callSessionId)}`}>
                <Warning size={18} weight="bold" />{t('managerMeetingMonitorPage.t26')}
              </Link>
            </div>
          ) : null}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--color-divider)] p-5">
          <h2 className="text-lg font-extrabold">{t('managerMeetingMonitorPage.t27')}</h2>
          <span className="text-sm text-[var(--color-text-secondary)]">{t('managerMeetingMonitorPage.t28')} {changeRequests.length}{t('managerMeetingMonitorPage.t29')}</span>
        </div>
        {changeRequests.length === 0 ? (
          <div className="p-6 text-center text-sm text-[var(--color-text-secondary)]">{t('managerMeetingMonitorPage.t30')}</div>
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
                    <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{t('managerMeetingMonitorPage.t31')} {new Date(request.requestedAt).toLocaleString('ko-KR')}{request.previousPosition !== null ? t('managerMeetingMonitorPage.t99', { p0: request.previousPosition }) : ''}</p>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button disabled={queueMutationBusy} onClick={() => void decideRequest(request, 'APPROVED')} size="sm">{t('managerMeetingMonitorPage.t32')}</Button>
                  <Button disabled={queueMutationBusy} onClick={() => void decideRequest(request, 'REJECTED')} size="sm" variant="danger">{t('managerMeetingMonitorPage.t33')}</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--color-divider)] p-5">
          <h2 className="text-lg font-extrabold">{t('managerMeetingMonitorPage.t34')}</h2>
          <span className="text-sm text-[var(--color-text-secondary)]">{t('managerMeetingMonitorPage.t35')} {queue.entries.length}{t('managerMeetingMonitorPage.t36')}</span>
        </div>
        {queue.entries.length === 0 ? (
          <div className="p-8 text-center text-[var(--color-text-secondary)]">{t('managerMeetingMonitorPage.t37')}</div>
        ) : (
          <div className="divide-y divide-[var(--color-divider)]">
            {queue.entries.map((entry) => (
              <div className="grid gap-4 p-5 sm:grid-cols-[60px_minmax(0,1fr)_110px_auto] sm:items-center" key={entry.queueEntryId}>
                <span className="flex size-10 items-center justify-center rounded-full bg-[var(--color-surface-page)] font-black">{entry.position}</span>
                <div>
                  <strong>{entry.nickname}</strong>
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{t('managerMeetingMonitorPage.t38')} {entry.callAttemptCount}{t('managerMeetingMonitorPage.t39')}</p>
                </div>
                <Badge variant={statusBadge(entry.status)}>{statusLabels()[entry.status]}</Badge>
                <div className="flex flex-wrap justify-end gap-2">
                  {isSoloInfluencer ? (
                    <Link
                      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--color-divider)] px-3 text-xs font-semibold hover:border-[var(--color-primary-coral)] hover:text-[var(--color-primary-coral)]"
                      to={fanRecordPath(entry)}
                    >
                      <NotePencil aria-hidden size={15} />{t('managerMeetingMonitorPage.t40')}
                    </Link>
                  ) : null}
                  {entry.status === 'WAITING' ? (
                    <>
                      <Button disabled={queueCallDisabled} onClick={() => void runQueueAction(entry, 'CALL')} size="sm" leadingIcon={<MonitorPlay size={16} />}>{t('managerMeetingMonitorPage.t41')}</Button>
                      <Button disabled={queueMutationBusy} onClick={() => void changePosition(entry)} size="sm" variant="secondary" leadingIcon={<ArrowsDownUp size={16} />}>{t('managerMeetingMonitorPage.t42')}</Button>
                    </>
                  ) : null}
                  {entry.status === 'CALLED' ? (
                    <Button disabled={queueCallDisabled} onClick={() => void runQueueAction(entry, 'NO_SHOW')} size="sm" variant="danger" leadingIcon={<UserMinus size={16} />}>{t('managerMeetingMonitorPage.t43')}</Button>
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
  const { t } = useTranslation()
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">{icon}{label}</div>
      <p className="mt-3 text-3xl font-black">{value}<span className="ml-1 text-sm font-semibold">{t('managerMeetingMonitorPage.t44')}</span></p>
    </Card>
  )
}
