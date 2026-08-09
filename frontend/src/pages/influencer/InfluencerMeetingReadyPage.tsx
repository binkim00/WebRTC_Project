import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { parseServerDate } from '../../api/serverTime'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertBanner, Button, Dialog, MediaDevicePreview } from '../../components'
import { getAuthSession } from '../../api/authSession'
import { ApiError } from '../../api/ApiError'
import {
  endFanMeeting,
  openWaitingRoomImmediately,
  serverLocalDateTimeMs,
} from '../../api/meetingManagement'
import {
  callQueueEntry,
  fetchFanMemos,
  fetchMeetingQueue,
  type FanMemo,
  type MeetingQueue,
} from '../../api/fanMeetingParticipants'
import {
  fetchPublicFanMeetingDetail,
  type PublicFanMeetingDetail,
} from '../../api/fanMeetings'
import { getMeetingNotice, getMeetingNotices } from '../../api/notices'
import { isQueueNotInitialized } from '../../api/queue'
import { useMediaDeviceCheck } from '../../hooks/useMediaDeviceCheck'
import { useNowTicker } from '../../hooks/useNowTicker'
import { usePolling } from '../../hooks/usePolling'
import { translate, useTranslation } from '../../i18n'

type DeviceCheckResult = {
  cameraOk?: boolean
  microphoneOk?: boolean
  speakerOk?: boolean
  networkOk?: boolean
}

/** 팬미팅 종료를 알린 뒤 메인으로 자동 이동하기까지 기다리는 시간이다. */
const MEETING_CLOSED_REDIRECT_MS = 5_000

/** 장비 점검 페이지가 저장한 결과를 읽는다. 없으면 점검 전으로 간주한다. */
function readDeviceCheck(meetingId?: string): DeviceCheckResult | null {
  if (!meetingId) return null

  try {
    const raw = window.sessionStorage.getItem(`melly-device-check:${meetingId}`)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    return parsed as DeviceCheckResult
  } catch {
    return null
  }
}

function isDeviceCheckPassed(result: DeviceCheckResult | null): boolean {
  return (
    result?.cameraOk === true &&
    result.microphoneOk === true &&
    result.speakerOk === true &&
    result.networkOk === true
  )
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

/** 2026.07.28 20:00 — L0 날짜·시간 표기다. */
function formatScheduledAt(value?: string) {
  if (!value) return translate('influencerMeetingReadyPage.t77')
  const date = parseServerDate(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 90초 · 10분 30초 · 30분 — 개요 셀의 시간 표기다. */
function formatDurationSec(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '—'
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  if (minutes === 0) return translate('influencerMeetingReadyPage.t78', { p0: seconds })
  if (seconds === 0) return translate('influencerMeetingReadyPage.t79', { p0: minutes })
  return translate('influencerMeetingReadyPage.t80', { p0: minutes, p1: seconds })
}

export function InfluencerMeetingReadyPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { fanMeetingId } = useParams()
  const [detail, setDetail] = useState<PublicFanMeetingDetail>()
  const [queue, setQueue] = useState<MeetingQueue>()
  const [currentFanMemo, setCurrentFanMemo] = useState<FanMemo>()
  const [notice, setNotice] = useState<{ title: string; body: string }>()
  const [error, setError] = useState<string>()
  const [openQueueConfirm, setOpenQueueConfirm] = useState(false)
  const [openingQueue, setOpeningQueue] = useState(false)
  const [openQueueError, setOpenQueueError] = useState<string>()
  const [callingNext, setCallingNext] = useState(false)
  const [callError, setCallError] = useState<string>()
  // 팬미팅 종료 확인 대화상자와 진행 상태다.
  const [endDialogOpen, setEndDialogOpen] = useState(false)
  const [ending, setEnding] = useState(false)
  const [endError, setEndError] = useState<string>()
  // 종료 안내 후 자동 이동할 시각이다. 렌더마다 다시 계산되면 안 되므로 ref로 고정한다.
  const closedRedirectAtRef = useRef<number | undefined>(undefined)
  // 대기열 오픈 시각 도달 여부와 진행 시간을 초 단위로 다시 계산하기 위한 시계다.
  const now = useNowTicker(1_000)
  // 1인 운영자는 통화 중 운영 콘솔을 볼 수 없으므로 대기열 오픈도 대기실에서 처리한다.
  const isSolo = getAuthSession()?.role === 'SOLO_INFLUENCER'

  const deviceCheck = readDeviceCheck(fanMeetingId)
  const isDeviceChecked = isDeviceCheckPassed(deviceCheck)

  // 대기실에서도 카메라 미리보기를 실시간으로 보여주기 위해 장비 스트림을 연다.
  const {
    errorMessage: mediaErrorMessage,
    start: startMedia,
    status: mediaStatus,
    stream,
  } = useMediaDeviceCheck()

  useEffect(() => {
    void startMedia()
  }, [startMedia])

  const isCameraLive =
    stream?.getVideoTracks().some((track) => track.readyState === 'live') ?? false
  // 권한 요청이 끝났는데 카메라가 살아있지 않으면 연결 이상으로 본다.
  const cameraBroken =
    mediaStatus !== 'idle' && mediaStatus !== 'requesting' && !isCameraLive

  /**
   * 팬미팅 상세를 다시 읽는다.
   *
   * 이전에는 마운트 시 한 번만 조회해서, 매니저가 팬미팅을 종료해도 대기실은 계속
   * 진행 중인 것처럼 보였다. 종료를 인플루언서가 알 수 있어야 하므로 주기적으로 갱신한다.
   */
  const loadMeeting = useCallback(async (signal?: AbortSignal) => {
    if (!fanMeetingId) return

    const session = getAuthSession()
    if (!session) return

    try {
      setDetail(
        await fetchPublicFanMeetingDetail(
          Number(fanMeetingId),
          session.accessToken,
          signal,
          true,
        ),
      )
    } catch (reason: unknown) {
      if (signal?.aborted) return
      setError(
        reason instanceof ApiError || reason instanceof TypeError
          ? reason.message
          : t('influencerMeetingReadyPage.t47'),
      )
    }
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fanMeetingId])

  // 종료·취소를 늦게 알아차리지 않도록 10초마다 상태를 확인한다.
  usePolling(loadMeeting, { intervalMs: 10_000 })

  /** 팬미팅이 끝났거나 취소되어 더 이상 통화를 진행할 수 없는 상태다. */
  const isMeetingClosed =
    detail?.meeting.status === 'ENDED' || detail?.meeting.status === 'CANCELED'

  /**
   * 팬미팅이 종료되면 안내를 보여 준 뒤 메인으로 보낸다.
   *
   * 종료된 대기실에 계속 머물면 할 수 있는 일이 없다. 다만 즉시 이동하면 왜 화면이 바뀌었는지
   * 알 수 없으므로, 종료를 알리고 잠깐 읽을 시간을 준 뒤 이동한다.
   */
  useEffect(() => {
    if (!isMeetingClosed) return
    if (closedRedirectAtRef.current !== undefined) return

    closedRedirectAtRef.current = Date.now() + MEETING_CLOSED_REDIRECT_MS
    const timer = window.setTimeout(
      () => navigate('/', { replace: true }),
      MEETING_CLOSED_REDIRECT_MS,
    )
    return () => window.clearTimeout(timer)
  }, [isMeetingClosed, navigate])

  /** 자동 이동까지 남은 초. 종료 상태가 아니면 undefined다. */
  const closedRedirectRemainingSec = closedRedirectAtRef.current === undefined
    ? undefined
    : Math.max(0, Math.ceil((closedRedirectAtRef.current - now) / 1000))

  // 운영 공지 최신 1건 — 시작 시간 변경 같은 안내를 입장 전에 보여 준다.
  useEffect(() => {
    if (!fanMeetingId) return

    const controller = new AbortController()

    void (async () => {
      try {
        const page = await getMeetingNotices(fanMeetingId, { page: 0, size: 1 }, controller.signal)
        const summary = page.content[0]
        if (!summary) return
        const loaded = await getMeetingNotice(fanMeetingId, summary.noticeId, controller.signal)
        if (!controller.signal.aborted) {
          setNotice({ title: summary.title, body: loaded.content })
        }
      } catch {
        // 공지는 보조 정보라 실패해도 대기실 이용을 막지 않는다.
      }
    })()

    return () => controller.abort()
  }, [fanMeetingId])

  const loadCurrentCall = useCallback(async (signal?: AbortSignal) => {
    if (!fanMeetingId) return

    const session = getAuthSession()
    if (!session || (session.role !== 'INFLUENCER' && session.role !== 'SOLO_INFLUENCER')) {
      setError(t('influencerMeetingReadyPage.t48'))
      return
    }

    try {
      setQueue(await fetchMeetingQueue(fanMeetingId, session.accessToken, signal))
      setError(undefined)
    } catch (reason) {
      if (signal?.aborted) return
      // 팬미팅이 종료되면 Redis 대기열이 정리되어 오픈 전과 같은 409가 돌아온다.
      // 장애가 아니므로 빈 대기열로 두고 오류를 띄우지 않는다.
      if (isQueueNotInitialized(reason)) {
        setQueue(undefined)
        setError(undefined)
        return
      }
      setError(
        reason instanceof ApiError || reason instanceof TypeError
          ? reason.message
          : t('influencerMeetingReadyPage.t49'),
      )
    }
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fanMeetingId])

  /** 대기열 오픈 시각(밀리초). 상세 정보를 아직 불러오지 못했으면 undefined다. */
  const queueOpenAtMs = useMemo(() => {
    // 서버는 offset 없는 LocalDateTime을 보내므로 KST 기준으로 해석해야 한다.
    const time = serverLocalDateTimeMs(detail?.meeting.operation.queueOpenAt ?? undefined)
    return Number.isFinite(time) ? time : undefined
  }, [detail?.meeting.operation.queueOpenAt])

  /** 대기열 오픈 전인지 여부. 오픈 시각 정보가 없으면 기존처럼 바로 폴링한다. */
  const isBeforeQueueOpen = queueOpenAtMs !== undefined && now < queueOpenAtMs

  // 대기열 정보를 3초마다 폴링한다. 오픈 전에는 백엔드가 QUEUE_NOT_INITIALIZED 오류를
  // 반환하므로 폴링하지 않고, 오픈 시각이 지나면 자동으로 폴링을 시작한다.
  // usePolling은 직렬 폴링이라 응답이 밀려도 오래된 대기열이 최신 화면을 덮지 않는다.
  // 종료·취소된 뒤에는 대기열이 정리되어 조회할 것이 없으므로 폴링도 멈춘다.
  usePolling(loadCurrentCall, {
    intervalMs: 3_000,
    enabled: !isBeforeQueueOpen && !isMeetingClosed,
  })

  const entries = useMemo(() => queue?.entries ?? [], [queue?.entries])

  const currentEntry = useMemo(() => {
    if (queue?.currentCall) {
      const matched = entries.find(
        (entry) => entry.participantId === queue.currentCall?.participantId,
      )
      if (matched) return matched
    }
    return entries.find((entry) => entry.status === 'IN_CALL')
  }, [entries, queue?.currentCall])

  const nextEntry = useMemo(() => {
    return entries
      .filter(
        (entry) =>
          (entry.status === 'WAITING' || entry.status === 'CALLED') &&
          entry.participantId !== currentEntry?.participantId,
      )
      .sort((a, b) => a.position - b.position)[0]
  }, [currentEntry?.participantId, entries])

  const completedFanCount = useMemo(
    () => entries.filter((entry) => entry.status === 'COMPLETED').length,
    [entries],
  )
  // 모집 정원(capacity)이 아니라 실제 대기열 참가자 수를 진행률의 분모로 사용한다.
  const totalFanCount = entries.length
  const progressPercent = totalFanCount > 0
    ? Math.round((completedFanCount / totalFanCount) * 100)
    : 0

  const currentFanName = queue?.currentCall?.nickname ?? currentEntry?.nickname
  const currentFanId = currentEntry?.fanId

  // 현재 팬의 최근 메모를 조회한다.
  useEffect(() => {
    if (!currentFanId) {
      setCurrentFanMemo(undefined)
      return
    }

    const session = getAuthSession()
    if (!session) return

    const controller = new AbortController()

    void fetchFanMemos(currentFanId, session.accessToken, controller.signal)
      .then((response) => setCurrentFanMemo(response.content[0]))
      .catch(() => {
        // 메모 조회 실패는 대기실 이용을 막지 않는다.
        if (!controller.signal.aborted) setCurrentFanMemo(undefined)
      })

    return () => controller.abort()
  }, [currentFanId])

  const handleOpenMemo = () => {
    if (!fanMeetingId || !currentFanId) return
    // 통화 요약 조회에는 callSessionId가 필요한데 참가자 응답에는 없다.
    // 진행 중인 통화의 상대 팬을 여는 경우에만 현재 세션을 함께 넘겨 요약 탭이 동작하게 한다.
    const callSessionId = currentEntry?.participantId === queue?.currentCall?.participantId
      ? queue?.currentCall?.callSessionId
      : undefined
    const callSessionQuery = callSessionId
      ? `&callSessionId=${encodeURIComponent(callSessionId)}`
      : ''
    navigate(
      `/influencer/fan-meetings/${fanMeetingId}/fans/${currentFanId}/records?tab=memo${callSessionQuery}`,
    )
  }

  /** 대기실 오픈 시각을 현재로 당긴 뒤 상세를 다시 불러와 폴링을 시작시킨다. */
  async function handleOpenQueueNow() {
    const session = getAuthSession()
    if (!fanMeetingId || !session || openingQueue) return

    setOpeningQueue(true)
    setOpenQueueError(undefined)
    try {
      await openWaitingRoomImmediately(fanMeetingId, session.accessToken)
      const refreshed = await fetchPublicFanMeetingDetail(
        Number(fanMeetingId),
        session.accessToken,
        undefined,
        true,
      )
      setDetail(refreshed)
      setOpenQueueConfirm(false)
    } catch (reason) {
      setOpenQueueError(
        reason instanceof ApiError || reason instanceof TypeError
          ? reason.message
          : t('influencerMeetingReadyPage.t50'),
      )
    } finally {
      setOpeningQueue(false)
    }
  }

  const handleEnterCall = () => {
    if (!fanMeetingId) return
    // 종료된 팬미팅에서는 서버가 LiveKit Room을 이미 삭제했으므로 입장을 막는다.
    if (isMeetingClosed) return
    if (!isDeviceChecked || cameraBroken || !queue?.currentCall) return
    navigate(
      `/influencer/fan-meetings/${fanMeetingId}/calls/${encodeURIComponent(queue.currentCall.callSessionId)}`,
    )
  }

  /**
   * 팬미팅 전체를 종료한다.
   *
   * 백엔드 `end`는 담당 매니저 또는 진행 인플루언서를 허용한다. 지금까지 프론트가 매니저
   * 콘솔에만 종료 버튼을 두어 소속 인플루언서는 자기 팬미팅을 끝낼 방법이 없었다.
   */
  async function handleEndMeeting() {
    if (!fanMeetingId || ending) return

    const session = getAuthSession()
    if (!session) return

    setEnding(true)
    setEndError(undefined)
    try {
      await endFanMeeting(fanMeetingId, session.accessToken)
      // 폴링을 기다리지 않고 즉시 종료 상태를 반영한다.
      await loadMeeting()
      setEndDialogOpen(false)
    } catch (reason: unknown) {
      setEndError(
        reason instanceof ApiError || reason instanceof TypeError
          ? reason.message
          : t('influencerMeetingReadyPage.t51'),
      )
    } finally {
      setEnding(false)
    }
  }

  /** 다음 대기 팬을 호출하고, 직접 통화하는 1인 운영자이므로 바로 통화 화면으로 들어간다. */
  async function handleCallNext(target: { queueEntryId: string; nickname: string }) {
    const session = getAuthSession()
    if (!fanMeetingId || !session || callingNext || isMeetingClosed) return

    setCallingNext(true)
    setCallError(undefined)
    try {
      const response = await callQueueEntry(target.queueEntryId, session.accessToken)
      navigate(
        `/influencer/fan-meetings/${fanMeetingId}/calls/${encodeURIComponent(response.callSessionId)}`,
      )
    } catch (reason) {
      setCallError(
        reason instanceof ApiError || reason instanceof TypeError
          ? reason.message
          : t('influencerMeetingReadyPage.t81', { p0: target.nickname }),
      )
      setCallingNext(false)
    }
  }

  const influencerName = detail?.influencer.name ?? ''
  const callDurationSec = detail?.meeting.operation.callDurationSec
  const perFanLabel = callDurationSec !== undefined ? formatDurationSec(callDurationSec) : '—'
  const expectedTotalLabel =
    callDurationSec !== undefined && totalFanCount > 0
      ? formatDurationSec(callDurationSec * totalFanCount)
      : '—'
  // 정확한 누적 시간 API가 없어 완료 세션 × 1인당 시간 + 현재 세션 경과로 근사한다.
  const elapsedApproxSec = useMemo(() => {
    if (callDurationSec === undefined) return undefined
    const currentStartedAt = queue?.currentCall?.startedAt
    const currentElapsed = currentStartedAt
      ? Math.max(0, (now - parseServerDate(currentStartedAt).getTime()) / 1000)
      : 0
    return completedFanCount * callDurationSec + Math.min(currentElapsed, callDurationSec)
  }, [callDurationSec, completedFanCount, now, queue?.currentCall?.startedAt])

  // dc.html의 5상태(ready/connection/unchecked/no-fan/last)를 실제 상태에 대응시킨다.
  const noFan = !queue?.currentCall
  const isLastFan = Boolean(queue?.currentCall && !nextEntry)
  const blocked = cameraBroken || !isDeviceChecked || noFan || isMeetingClosed

  // 1인 운영자는 대기 팬을 대기실에서 직접 호출한다. 호출 API가 팬미팅 상태를 검사하지
  // 않으므로 조기 세션 생성을 막기 위해 LIVE를 프론트에서 확인한다. (운영 콘솔과 동일 규칙)
  const meetingLive = detail?.meeting.status === 'LIVE'
  const callableEntry =
    isSolo && noFan && nextEntry?.status === 'WAITING' ? nextEntry : undefined
  const callBlocked = cameraBroken || !isDeviceChecked || !meetingLive
  const callHelp = cameraBroken
    ? t('influencerMeetingReadyPage.t52')
    : !isDeviceChecked
      ? t('influencerMeetingReadyPage.t53')
      : !meetingLive
        ? t('influencerMeetingReadyPage.t54')
        : t('influencerMeetingReadyPage.t82', { p0: callableEntry?.nickname ?? t('influencerMeetingReadyPage.t55') })

  const statusLine = cameraBroken
    ? t('influencerMeetingReadyPage.t56')
    : !isDeviceChecked
      ? t('influencerMeetingReadyPage.t57')
      : noFan
        ? t('influencerMeetingReadyPage.t58')
        : isLastFan
          ? t('influencerMeetingReadyPage.t59')
          : t('influencerMeetingReadyPage.t83', { p0: currentEntry?.position ?? '-' })
  const equipLabel = cameraBroken
    ? t('influencerMeetingReadyPage.t60')
    : !isDeviceChecked
      ? t('influencerMeetingReadyPage.t61')
      : t('influencerMeetingReadyPage.t62')
  const ctaHelp = cameraBroken
    ? t('influencerMeetingReadyPage.t63')
    : !isDeviceChecked
      ? t('influencerMeetingReadyPage.t64')
      : noFan
        ? t('influencerMeetingReadyPage.t65')
        : isLastFan
          ? t('influencerMeetingReadyPage.t84', { p0: currentFanName ?? t('influencerMeetingReadyPage.t66'), p1: perFanLabel })
          : t('influencerMeetingReadyPage.t85', { p0: currentFanName ?? t('influencerMeetingReadyPage.t67'), p1: perFanLabel })

  return (
    <div>
      {/* 종료·취소는 오류가 아니라 확정된 결과이므로 다른 안내보다 먼저 알린다 */}
      {isMeetingClosed ? (
        <AlertBanner
          className="mb-6"
          title={
            detail?.meeting.status === 'CANCELED'
              ? t('influencerMeetingReadyPage.t68')
              : t('influencerMeetingReadyPage.t69')
          }
          variant="info"
        >
          {t('influencerMeetingReadyPage.t1')}
          {closedRedirectRemainingSec !== undefined
            ? t('influencerMeetingReadyPage.t86', { p0: closedRedirectRemainingSec })
            : ''}
        </AlertBanner>
      ) : null}

      {/* 대기열 오픈 전에는 오류 대신 오픈 예정 안내를 표시한다 */}
      {!isMeetingClosed && isBeforeQueueOpen ? (
        <div className="mb-6 grid gap-3">
          <AlertBanner title={t('influencerMeetingReadyPage.t2')} variant="info">
            {formatScheduledAt(detail?.meeting.operation.queueOpenAt ?? undefined)} {t('influencerMeetingReadyPage.t3')}
          </AlertBanner>
          {isSolo ? (
            <div>
              <button
                className="mj-font-label inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--color-primary-coral)] bg-[var(--color-surface-panel)] px-[18px] text-[15px] text-[var(--color-primary-coral)] transition-colors hover:bg-[var(--color-primary-coral)] hover:text-white"
                onClick={() => {
                  setOpenQueueError(undefined)
                  setOpenQueueConfirm(true)
                }}
                type="button"
              >
                {t('influencerMeetingReadyPage.t4')}
              </button>
              {openQueueError ? (
                <p className="mt-2 text-sm font-medium text-[var(--color-error)]" role="alert">
                  {openQueueError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : error ? (
        <AlertBanner className="mb-6" title={t('influencerMeetingReadyPage.t5')} variant="error">
          {error}
        </AlertBanner>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-[26px] font-black tracking-[-0.035em]">{t('influencerMeetingReadyPage.t6')}</h1>
          <p className="mt-[7px] text-[15px] font-medium text-[var(--color-text-muted)]">
            {t('influencerMeetingReadyPage.t7')}
          </p>
        </div>
        <p
          className={`whitespace-nowrap text-sm font-bold ${blocked ? 'text-[var(--color-warning)]' : 'text-[var(--color-success)]'}`}
        >
          {statusLine}
        </p>
      </div>

      <section
        aria-label={t('influencerMeetingReadyPage.t8')}
        className="mt-6 grid grid-cols-2 border-y border-[var(--color-divider)] lg:grid-cols-[1.5fr_1fr_1fr_1fr]"
      >
        <div className="py-[18px] pr-6">
          <p className="text-[13px] font-bold text-[var(--color-text-muted)]">{t('influencerMeetingReadyPage.t9')}</p>
          <p className="mt-1.5 truncate text-lg font-extrabold tracking-[-0.025em]">
            {detail?.meeting.title ?? t('influencerMeetingReadyPage.t70')}
          </p>
          <p className="mt-1 text-sm font-medium tabular-nums text-[var(--color-text-muted)]">
            {influencerName ? `${influencerName} · ` : ''}
            {formatScheduledAt(detail?.meeting.scheduledStartAt)}
          </p>
        </div>
        <div className="border-l border-[var(--color-divider)] px-6 py-[18px]">
          <p className="text-[13px] font-bold text-[var(--color-text-muted)]">{t('influencerMeetingReadyPage.t10')}</p>
          <p className="mt-1.5 text-xl font-extrabold tabular-nums">{perFanLabel}</p>
        </div>
        <div className="border-t border-[var(--color-divider)] py-[18px] pr-6 lg:border-l lg:border-t-0 lg:px-6">
          <p className="text-[13px] font-bold text-[var(--color-text-muted)]">{t('influencerMeetingReadyPage.t11')}</p>
          <p className="mt-1.5 text-xl font-extrabold tabular-nums">{expectedTotalLabel}</p>
        </div>
        <div className="border-l border-t border-[var(--color-divider)] px-6 py-[18px] lg:border-t-0">
          <p className="text-[13px] font-bold text-[var(--color-text-muted)]">{t('influencerMeetingReadyPage.t12')}</p>
          <p className="mt-1.5 text-xl font-extrabold tabular-nums">
            {elapsedApproxSec !== undefined ? formatDurationSec(elapsedApproxSec) : '—'}
          </p>
        </div>
      </section>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_424px] lg:gap-11">
        <section aria-labelledby="ir-cam" className="min-w-0">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-lg font-extrabold tracking-[-0.028em]" id="ir-cam">
              {t('influencerMeetingReadyPage.t13')}
            </h2>
            <p
              className={`text-sm font-bold ${cameraBroken || !isDeviceChecked ? 'text-[var(--color-warning)]' : 'text-[var(--color-success)]'}`}
            >
              {equipLabel}
            </p>
          </div>

          <figure className="relative m-0 mt-3.5 overflow-hidden rounded-[10px] border border-[var(--color-divider)] bg-[var(--color-surface-muted)]">
            <MediaDevicePreview className="rounded-none shadow-none" stream={stream} />
            {stream ? (
              <figcaption className="absolute bottom-3.5 left-3.5 flex items-center gap-2 rounded-lg bg-[rgb(23_24_29/72%)] px-3 py-[7px]">
                <span className="text-sm font-bold text-white">{influencerName}</span>
                <span className="text-[13px] font-medium text-white/75">{t('influencerMeetingReadyPage.t14')}</span>
              </figcaption>
            ) : null}
            {cameraBroken ? (
              <div
                className="absolute inset-0 grid place-items-center bg-[rgb(23_24_29/62%)] p-6"
                role="status"
              >
                <div className="max-w-[340px] rounded-[10px] bg-[var(--color-surface-panel)] p-[22px] text-center">
                  <p className="text-[17px] font-extrabold tracking-[-0.028em] text-[var(--color-warning)]">
                    {t('influencerMeetingReadyPage.t15')}
                  </p>
                  <p className="mt-2 text-[15px] font-medium leading-[1.6] text-[var(--color-text-body)]">
                    {mediaErrorMessage ??
                      t('influencerMeetingReadyPage.t71')}
                  </p>
                  <button
                    className="mj-font-label mt-4 flex min-h-[46px] w-full items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border-control)] bg-[var(--color-surface-panel)] text-[15px] hover:border-[var(--color-text-muted)]"
                    onClick={() => void startMedia()}
                    type="button"
                  >
                    {t('influencerMeetingReadyPage.t16')}
                  </button>
                </div>
              </div>
            ) : null}
          </figure>

          {!isDeviceChecked ? (
            <Link
              className="mj-font-label mt-3.5 inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--color-border-control)] bg-[var(--color-surface-panel)] px-[18px] text-[15px] hover:border-[var(--color-primary-coral)] hover:text-[var(--color-primary-coral)]"
              to={`/influencer/fan-meetings/${fanMeetingId}/device-check`}
            >
              {t('influencerMeetingReadyPage.t17')}
            </Link>
          ) : null}
        </section>

        <aside aria-label={t('influencerMeetingReadyPage.t18')} className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] font-bold text-[var(--color-text-muted)]">{t('influencerMeetingReadyPage.t19')}</p>
            <Link
              className="text-sm font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              to={`/influencer/fan-meetings/${fanMeetingId}/fans`}
            >
              {t('influencerMeetingReadyPage.t20')}
            </Link>
          </div>
          <p className="mt-2 text-[15px] font-extrabold tabular-nums">
            {completedFanCount}{t('influencerMeetingReadyPage.t21')}{' '}
            <span className="font-medium text-[var(--color-text-muted)]">
              {currentEntry ? t('influencerMeetingReadyPage.t87', { p0: currentEntry.position }) : ''}{t('influencerMeetingReadyPage.t22')} {totalFanCount}{t('influencerMeetingReadyPage.t23')}
            </span>
          </p>
          <div
            aria-label={t('influencerMeetingReadyPage.t24')}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={progressPercent}
            className="mt-[9px] h-1 overflow-hidden rounded-sm bg-[var(--color-surface-muted)]"
            role="progressbar"
          >
            <span
              className="block h-full bg-[var(--color-primary-coral)]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {currentFanName ? (
            <section
              aria-labelledby="ir-cur"
              className="mt-[26px] border-t border-[var(--color-divider)] pt-[22px]"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[13px] font-bold text-[var(--color-primary-coral)]">{t('influencerMeetingReadyPage.t25')}</p>
                {currentEntry ? (
                  <p className="text-sm font-bold tabular-nums text-[var(--color-text-muted)]">
                    {currentEntry.position}{t('influencerMeetingReadyPage.t26')}
                  </p>
                ) : null}
              </div>
              <div className="mt-3 flex items-center gap-3.5">
                {currentEntry?.profileImageUrl ? (
                  <img
                    alt={t('influencerMeetingReadyPage.t88', { p0: currentFanName })}
                    className="size-14 flex-none rounded-lg bg-[var(--color-surface-muted)] object-cover"
                    decoding="async"
                    src={currentEntry.profileImageUrl}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="grid size-14 flex-none place-items-center rounded-lg bg-[var(--color-surface-muted)] text-lg font-extrabold text-[var(--color-text-muted)]"
                  >
                    {currentFanName.slice(0, 1)}
                  </span>
                )}
                <div className="min-w-0">
                  <h3 className="text-[21px] font-black tracking-[-0.032em]" id="ir-cur">
                    {currentFanName}
                  </h3>
                  <p className="mt-1 text-sm font-medium text-[var(--color-text-muted)]">
                    {currentFanMemo ? t('influencerMeetingReadyPage.t72') : t('influencerMeetingReadyPage.t73')}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-lg bg-[var(--color-surface-subtle)] px-4 py-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[13px] font-bold text-[var(--color-text-muted)]">{t('influencerMeetingReadyPage.t27')}</p>
                  <button
                    className="text-sm font-bold hover:text-[var(--color-primary-coral)]"
                    onClick={handleOpenMemo}
                    type="button"
                  >
                    {t('influencerMeetingReadyPage.t28')}
                  </button>
                </div>
                <p className="mt-2 text-[15px] font-medium leading-[1.65] text-[var(--color-text-body)]">
                  {currentFanMemo?.content ?? t('influencerMeetingReadyPage.t74')}
                </p>
              </div>
            </section>
          ) : (
            <section
              aria-labelledby="ir-cur-empty"
              className="mt-[26px] border-t border-[var(--color-divider)] pt-[22px]"
            >
              <h3 className="text-lg font-extrabold tracking-[-0.028em]" id="ir-cur-empty">
                {t('influencerMeetingReadyPage.t29')}
              </h3>
              <p className="mt-2 text-[15px] font-medium leading-[1.65] text-[var(--color-text-muted)]">
                {t('influencerMeetingReadyPage.t30')}
              </p>
            </section>
          )}

          <section
            aria-labelledby="ir-next"
            className="mt-[22px] border-t border-[var(--color-divider)] pt-5"
          >
            {nextEntry ? (
              <div className="flex items-center gap-3">
                <div
                  aria-label={t('influencerMeetingReadyPage.t89', { p0: nextEntry.nickname })}
                  className="grid size-10 flex-none place-items-center rounded-lg bg-[var(--color-surface-muted)] text-[15px] font-extrabold text-[var(--color-text-muted)]"
                  role="img"
                >
                  {nextEntry.nickname.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-[var(--color-text-muted)]">
                    {t('influencerMeetingReadyPage.t31')} {nextEntry.position}{t('influencerMeetingReadyPage.t32')}
                  </p>
                  <h3 className="mt-[3px] text-base font-extrabold tracking-[-0.025em]" id="ir-next">
                    {nextEntry.nickname}
                  </h3>
                </div>
              </div>
            ) : (
              <div>
                <h3 className="text-base font-extrabold tracking-[-0.025em]" id="ir-next">
                  {t('influencerMeetingReadyPage.t33')}
                </h3>
                <p className="mt-1.5 text-[15px] font-medium leading-[1.6] text-[var(--color-text-muted)]">
                  {t('influencerMeetingReadyPage.t34')}
                </p>
              </div>
            )}
          </section>

          {notice ? (
            <p className="mt-[22px] border-t border-[var(--color-divider)] pt-[18px] text-sm font-medium leading-[1.65] text-[var(--color-text-muted)]">
              <strong className="block font-bold text-[var(--color-text-primary)]">
                {notice.title}
              </strong>
              {notice.body}
            </p>
          ) : null}

          {callableEntry ? (
            <>
              <button
                className={`mj-font-emphasis mt-[22px] min-h-14 w-full rounded-[10px] border text-[17px] transition-colors ${
                  callBlocked || callingNext
                    ? 'cursor-not-allowed border-[var(--color-border-control)] bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]'
                    : 'border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] text-white shadow-[var(--shadow-final-cta)] hover:bg-[var(--color-primary-coral-hover)]'
                }`}
                disabled={callBlocked || callingNext}
                onClick={() => void handleCallNext(callableEntry)}
                type="button"
              >
                {callingNext ? t('influencerMeetingReadyPage.t75') : t('influencerMeetingReadyPage.t76')}
              </button>
              <p
                aria-live="polite"
                className="mt-2.5 text-sm font-medium leading-[1.6] text-[var(--color-text-muted)]"
              >
                {callHelp}
              </p>
              {callError ? (
                <p className="mt-2 text-sm font-medium text-[var(--color-error)]" role="alert">
                  {callError}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <button
                className={`mj-font-emphasis mt-[22px] min-h-14 w-full rounded-[10px] border text-[17px] transition-colors ${
                  blocked
                    ? 'cursor-not-allowed border-[var(--color-border-control)] bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]'
                    : 'border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] text-white shadow-[var(--shadow-final-cta)] hover:bg-[var(--color-primary-coral-hover)]'
                }`}
                disabled={blocked}
                onClick={handleEnterCall}
                type="button"
              >
                {t('influencerMeetingReadyPage.t35')}
              </button>
              <p
                aria-live="polite"
                className="mt-2.5 text-sm font-medium leading-[1.6] text-[var(--color-text-muted)]"
              >
                {ctaHelp}
              </p>
            </>
          )}

          {/* 소속 인플루언서는 매니저 콘솔에 접근할 수 없으므로 이 화면에서 직접 종료해야 한다. */}
          {!isMeetingClosed && meetingLive ? (
            <button
              className="mj-font-label mt-4 flex min-h-[46px] w-full items-center justify-center rounded-[10px] border border-[var(--color-border-control)] bg-[var(--color-surface-panel)] text-[15px] text-[var(--color-error)] transition-colors hover:border-[var(--color-error)]"
              onClick={() => {
                setEndError(undefined)
                setEndDialogOpen(true)
              }}
              type="button"
            >
              {t('influencerMeetingReadyPage.t36')}
            </button>
          ) : null}
          {endError ? (
            <p className="mt-2 text-sm font-medium text-[var(--color-error)]" role="alert">
              {endError}
            </p>
          ) : null}
        </aside>
      </div>

      <Dialog
        description={t('influencerMeetingReadyPage.t37')}
        footer={
          <>
            <Button disabled={ending} onClick={() => setEndDialogOpen(false)} variant="secondary">
              {t('influencerMeetingReadyPage.t38')}
            </Button>
            <Button loading={ending} onClick={() => void handleEndMeeting()} variant="danger">
              {t('influencerMeetingReadyPage.t39')}
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!open && !ending) setEndDialogOpen(false)
        }}
        open={endDialogOpen}
        title={t('influencerMeetingReadyPage.t40')}
      >
        {endError ? (
          <AlertBanner title={t('influencerMeetingReadyPage.t41')} variant="error">
            {endError}
          </AlertBanner>
        ) : null}
      </Dialog>

      <Dialog
        description={t('influencerMeetingReadyPage.t42')}
        footer={
          <>
            <Button
              disabled={openingQueue}
              onClick={() => setOpenQueueConfirm(false)}
              variant="secondary"
            >
              {t('influencerMeetingReadyPage.t43')}
            </Button>
            <Button loading={openingQueue} onClick={() => void handleOpenQueueNow()}>
              {t('influencerMeetingReadyPage.t44')}
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!open && !openingQueue) setOpenQueueConfirm(false)
        }}
        open={openQueueConfirm}
        title={t('influencerMeetingReadyPage.t45')}
      >
        {openQueueError ? (
          <AlertBanner title={t('influencerMeetingReadyPage.t46')} variant="error">
            {openQueueError}
          </AlertBanner>
        ) : null}
      </Dialog>
    </div>
  )
}
