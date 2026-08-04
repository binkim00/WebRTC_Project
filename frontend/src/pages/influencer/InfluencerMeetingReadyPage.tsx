import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertBanner, Button, Dialog, MediaDevicePreview } from '../../components'
import { getAuthSession } from '../../api/authSession'
import { ApiError } from '../../api/ApiError'
import { openWaitingRoomImmediately, serverLocalDateTimeMs } from '../../api/meetingManagement'
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
import { useMediaDeviceCheck } from '../../hooks/useMediaDeviceCheck'

type DeviceCheckResult = {
  cameraOk?: boolean
  microphoneOk?: boolean
  speakerOk?: boolean
  networkOk?: boolean
}

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
  if (!value) return '일정 확인 중'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 90초 · 10분 30초 · 30분 — 개요 셀의 시간 표기다. */
function formatDurationSec(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '—'
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  if (minutes === 0) return `${seconds}초`
  if (seconds === 0) return `${minutes}분`
  return `${minutes}분 ${seconds}초`
}

export function InfluencerMeetingReadyPage() {
  const navigate = useNavigate()
  const { fanMeetingId } = useParams()
  const [detail, setDetail] = useState<PublicFanMeetingDetail>()
  const [queue, setQueue] = useState<MeetingQueue>()
  const [currentFanMemo, setCurrentFanMemo] = useState<FanMemo>()
  const [notice, setNotice] = useState<{ title: string; body: string }>()
  const [error, setError] = useState<string>()
  const [now, setNow] = useState(() => Date.now())
  const [openQueueConfirm, setOpenQueueConfirm] = useState(false)
  const [openingQueue, setOpeningQueue] = useState(false)
  const [openQueueError, setOpenQueueError] = useState<string>()
  const [callingNext, setCallingNext] = useState(false)
  const [callError, setCallError] = useState<string>()
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

  useEffect(() => {
    if (!fanMeetingId) return

    const session = getAuthSession()
    if (!session) return

    const controller = new AbortController()

    void fetchPublicFanMeetingDetail(
      Number(fanMeetingId),
      session.accessToken,
      controller.signal,
    )
      .then(setDetail)
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(
          reason instanceof ApiError || reason instanceof TypeError
            ? reason.message
            : '팬미팅 정보를 불러오지 못했습니다.',
        )
      })

    return () => controller.abort()
  }, [fanMeetingId])

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
      setError('인플루언서 계정으로 로그인한 뒤 대기실을 이용해 주세요.')
      return
    }

    try {
      setQueue(await fetchMeetingQueue(fanMeetingId, session.accessToken, signal))
      setError(undefined)
    } catch (reason) {
      if (signal?.aborted) return
      setError(
        reason instanceof ApiError || reason instanceof TypeError
          ? reason.message
          : '현재 통화 정보를 불러오지 못했습니다.',
      )
    }
  }, [fanMeetingId])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

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
  useEffect(() => {
    if (isBeforeQueueOpen) return

    const controller = new AbortController()
    void loadCurrentCall(controller.signal)

    const timer = window.setInterval(() => {
      void loadCurrentCall(controller.signal)
    }, 3_000)

    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [isBeforeQueueOpen, loadCurrentCall])

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
      )
      setDetail(refreshed)
      setOpenQueueConfirm(false)
    } catch (reason) {
      setOpenQueueError(
        reason instanceof ApiError || reason instanceof TypeError
          ? reason.message
          : '대기열을 열지 못했습니다. 잠시 후 다시 시도해 주세요.',
      )
    } finally {
      setOpeningQueue(false)
    }
  }

  const handleEnterCall = () => {
    if (!fanMeetingId) return
    if (!isDeviceChecked || cameraBroken || !queue?.currentCall) return
    navigate(
      `/influencer/fan-meetings/${fanMeetingId}/calls/${encodeURIComponent(queue.currentCall.callSessionId)}`,
    )
  }

  /** 다음 대기 팬을 호출하고, 직접 통화하는 1인 운영자이므로 바로 통화 화면으로 들어간다. */
  async function handleCallNext(target: { queueEntryId: string; nickname: string }) {
    const session = getAuthSession()
    if (!fanMeetingId || !session || callingNext) return

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
          : `${target.nickname} 님을 호출하지 못했습니다. 잠시 후 다시 시도해 주세요.`,
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
      ? Math.max(0, (now - new Date(currentStartedAt).getTime()) / 1000)
      : 0
    return completedFanCount * callDurationSec + Math.min(currentElapsed, callDurationSec)
  }, [callDurationSec, completedFanCount, now, queue?.currentCall?.startedAt])

  // dc.html의 5상태(ready/connection/unchecked/no-fan/last)를 실제 상태에 대응시킨다.
  const noFan = !queue?.currentCall
  const isLastFan = Boolean(queue?.currentCall && !nextEntry)
  const blocked = cameraBroken || !isDeviceChecked || noFan

  // 1인 운영자는 대기 팬을 대기실에서 직접 호출한다. 호출 API가 팬미팅 상태를 검사하지
  // 않으므로 조기 세션 생성을 막기 위해 LIVE를 프론트에서 확인한다. (운영 콘솔과 동일 규칙)
  const meetingLive = detail?.meeting.status === 'LIVE'
  const callableEntry =
    isSolo && noFan && nextEntry?.status === 'WAITING' ? nextEntry : undefined
  const callBlocked = cameraBroken || !isDeviceChecked || !meetingLive
  const callHelp = cameraBroken
    ? '카메라 연결을 복구하면 호출할 수 있어요. 팬의 순번은 유지됩니다.'
    : !isDeviceChecked
      ? '장비 점검을 마치면 호출할 수 있어요.'
      : !meetingLive
        ? '팬미팅을 시작한 뒤에 팬을 호출할 수 있어요.'
        : `호출하면 ${callableEntry?.nickname ?? '다음 팬'} 님에게 입장 안내가 가고 바로 통화 화면으로 이동합니다.`

  const statusLine = cameraBroken
    ? '카메라 연결 이상 · 입장 불가'
    : !isDeviceChecked
      ? '장비 점검 미완료 · 입장 불가'
      : noFan
        ? '대기 중 · 입장 가능한 팬 없음'
        : isLastFan
          ? '진행 중 · 마지막 팬'
          : `진행 중 · ${currentEntry?.position ?? '-'}번째 팬`
  const equipLabel = cameraBroken
    ? '장비 상태 · 카메라 연결 이상'
    : !isDeviceChecked
      ? '장비 상태 · 점검 미완료'
      : '장비 상태 · 점검 완료'
  const ctaHelp = cameraBroken
    ? '카메라 연결을 복구하면 입장할 수 있어요. 팬의 순번은 유지됩니다.'
    : !isDeviceChecked
      ? '장비 점검을 마치면 입장할 수 있어요.'
      : noFan
        ? '입장 가능한 팬이 없습니다. 다음 팬이 준비되면 입장할 수 있어요.'
        : isLastFan
          ? `입장하면 오늘의 마지막 통화가 시작됩니다. ${currentFanName ?? '팬'} 님과 ${perFanLabel}입니다.`
          : `입장하면 ${currentFanName ?? '팬'} 님과의 ${perFanLabel} 통화가 시작됩니다.`

  return (
    <div>
      {/* 대기열 오픈 전에는 오류 대신 오픈 예정 안내를 표시한다 */}
      {isBeforeQueueOpen ? (
        <div className="mb-6 grid gap-3">
          <AlertBanner title="대기열이 아직 열리지 않았습니다" variant="info">
            {formatScheduledAt(detail?.meeting.operation.queueOpenAt ?? undefined)} 오픈
            예정입니다. 오픈되면 자동으로 대기열 정보를 불러옵니다. 그동안 카메라와 마이크
            상태를 점검해 주세요.
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
                대기열 지금 오픈
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
        <AlertBanner className="mb-6" title="통화 정보를 확인할 수 없습니다" variant="error">
          {error}
        </AlertBanner>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-[26px] font-black tracking-[-0.035em]">대기실</h1>
          <p className="mt-[7px] text-[15px] font-medium text-[var(--color-text-muted)]">
            화면과 팬 정보를 확인한 뒤 영상 통화에 입장하세요.
          </p>
        </div>
        <p
          className={`whitespace-nowrap text-sm font-bold ${blocked ? 'text-[var(--color-warning)]' : 'text-[var(--color-success)]'}`}
        >
          {statusLine}
        </p>
      </div>

      <section
        aria-label="팬미팅 개요"
        className="mt-6 grid grid-cols-2 border-y border-[var(--color-divider)] lg:grid-cols-[1.5fr_1fr_1fr_1fr]"
      >
        <div className="py-[18px] pr-6">
          <p className="text-[13px] font-bold text-[var(--color-text-muted)]">오늘 진행</p>
          <p className="mt-1.5 truncate text-lg font-extrabold tracking-[-0.025em]">
            {detail?.meeting.title ?? '팬미팅 정보를 불러오는 중'}
          </p>
          <p className="mt-1 text-sm font-medium tabular-nums text-[var(--color-text-muted)]">
            {influencerName ? `${influencerName} · ` : ''}
            {formatScheduledAt(detail?.meeting.scheduledStartAt)}
          </p>
        </div>
        <div className="border-l border-[var(--color-divider)] px-6 py-[18px]">
          <p className="text-[13px] font-bold text-[var(--color-text-muted)]">팬 1명당</p>
          <p className="mt-1.5 text-xl font-extrabold tabular-nums">{perFanLabel}</p>
        </div>
        <div className="border-t border-[var(--color-divider)] py-[18px] pr-6 lg:border-l lg:border-t-0 lg:px-6">
          <p className="text-[13px] font-bold text-[var(--color-text-muted)]">예상 총 소요</p>
          <p className="mt-1.5 text-xl font-extrabold tabular-nums">{expectedTotalLabel}</p>
        </div>
        <div className="border-l border-t border-[var(--color-divider)] px-6 py-[18px] lg:border-t-0">
          <p className="text-[13px] font-bold text-[var(--color-text-muted)]">현재까지 진행</p>
          <p className="mt-1.5 text-xl font-extrabold tabular-nums">
            {elapsedApproxSec !== undefined ? formatDurationSec(elapsedApproxSec) : '—'}
          </p>
        </div>
      </section>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_424px] lg:gap-11">
        <section aria-labelledby="ir-cam" className="min-w-0">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-lg font-extrabold tracking-[-0.028em]" id="ir-cam">
              현재 화면
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
                <span className="text-[13px] font-medium text-white/75">카메라 미리보기</span>
              </figcaption>
            ) : null}
            {cameraBroken ? (
              <div
                className="absolute inset-0 grid place-items-center bg-[rgb(23_24_29/62%)] p-6"
                role="status"
              >
                <div className="max-w-[340px] rounded-[10px] bg-[var(--color-surface-panel)] p-[22px] text-center">
                  <p className="text-[17px] font-extrabold tracking-[-0.028em] text-[var(--color-warning)]">
                    카메라 연결을 확인해 주세요
                  </p>
                  <p className="mt-2 text-[15px] font-medium leading-[1.6] text-[var(--color-text-body)]">
                    {mediaErrorMessage ??
                      '화면 연결이 불안정합니다. 연결을 확인한 뒤 상태를 다시 확인해 주세요.'}
                  </p>
                  <button
                    className="mj-font-label mt-4 flex min-h-[46px] w-full items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border-control)] bg-[var(--color-surface-panel)] text-[15px] hover:border-[var(--color-text-muted)]"
                    onClick={() => void startMedia()}
                    type="button"
                  >
                    상태 재확인
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
              장비 점검하기
            </Link>
          ) : null}
        </section>

        <aside aria-label="팬 순서와 입장" className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] font-bold text-[var(--color-text-muted)]">팬 진행 순서</p>
            <Link
              className="text-sm font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              to={`/influencer/fan-meetings/${fanMeetingId}/fans`}
            >
              참가 팬
            </Link>
          </div>
          <p className="mt-2 text-[15px] font-extrabold tabular-nums">
            {completedFanCount}명 완료{' '}
            <span className="font-medium text-[var(--color-text-muted)]">
              {currentEntry ? `· 현재 ${currentEntry.position}번째 ` : ''}· 전체 {totalFanCount}명
            </span>
          </p>
          <div
            aria-label="팬미팅 진행률"
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
                <p className="text-[13px] font-bold text-[var(--color-primary-coral)]">현재 팬</p>
                {currentEntry ? (
                  <p className="text-sm font-bold tabular-nums text-[var(--color-text-muted)]">
                    {currentEntry.position}번째
                  </p>
                ) : null}
              </div>
              <div className="mt-3 flex items-center gap-3.5">
                {currentEntry?.profileImageUrl ? (
                  <img
                    alt={`현재 팬 ${currentFanName}`}
                    className="size-14 flex-none rounded-lg bg-[var(--color-surface-muted)] object-cover"
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
                    {currentFanMemo ? '메모 있음' : '메모 없음'}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-lg bg-[var(--color-surface-subtle)] px-4 py-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[13px] font-bold text-[var(--color-text-muted)]">기존 메모</p>
                  <button
                    className="text-sm font-bold hover:text-[var(--color-primary-coral)]"
                    onClick={handleOpenMemo}
                    type="button"
                  >
                    메모 확인하기
                  </button>
                </div>
                <p className="mt-2 text-[15px] font-medium leading-[1.65] text-[var(--color-text-body)]">
                  {currentFanMemo?.content ?? '작성된 메모가 없습니다.'}
                </p>
              </div>
            </section>
          ) : (
            <section
              aria-labelledby="ir-cur-empty"
              className="mt-[26px] border-t border-[var(--color-divider)] pt-[22px]"
            >
              <h3 className="text-lg font-extrabold tracking-[-0.028em]" id="ir-cur-empty">
                아직 입장 가능한 팬이 없습니다
              </h3>
              <p className="mt-2 text-[15px] font-medium leading-[1.65] text-[var(--color-text-muted)]">
                다음 팬이 준비되면 현재 팬 정보가 표시됩니다.
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
                  aria-label={`다음 팬 ${nextEntry.nickname}`}
                  className="grid size-10 flex-none place-items-center rounded-lg bg-[var(--color-surface-muted)] text-[15px] font-extrabold text-[var(--color-text-muted)]"
                  role="img"
                >
                  {nextEntry.nickname.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-[var(--color-text-muted)]">
                    다음 팬 · {nextEntry.position}번째
                  </p>
                  <h3 className="mt-[3px] text-base font-extrabold tracking-[-0.025em]" id="ir-next">
                    {nextEntry.nickname}
                  </h3>
                </div>
              </div>
            ) : (
              <div>
                <h3 className="text-base font-extrabold tracking-[-0.025em]" id="ir-next">
                  마지막 팬입니다
                </h3>
                <p className="mt-1.5 text-[15px] font-medium leading-[1.6] text-[var(--color-text-muted)]">
                  이번 통화가 오늘의 마지막 순서예요.
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
                {callingNext ? '호출 중…' : '다음 팬 호출'}
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
                영상 통화 입장
              </button>
              <p
                aria-live="polite"
                className="mt-2.5 text-sm font-medium leading-[1.6] text-[var(--color-text-muted)]"
              >
                {ctaHelp}
              </p>
            </>
          )}
        </aside>
      </div>

      <Dialog
        description="당첨된 팬이 장비 점검 후 대기실에서 기다릴 수 있습니다. 오픈한 대기열은 다시 닫을 수 없습니다."
        footer={
          <>
            <Button
              disabled={openingQueue}
              onClick={() => setOpenQueueConfirm(false)}
              variant="secondary"
            >
              취소
            </Button>
            <Button loading={openingQueue} onClick={() => void handleOpenQueueNow()}>
              지금 오픈
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!open && !openingQueue) setOpenQueueConfirm(false)
        }}
        open={openQueueConfirm}
        title="대기열을 지금 오픈할까요?"
      >
        {openQueueError ? (
          <AlertBanner title="대기열을 열지 못했습니다" variant="error">
            {openQueueError}
          </AlertBanner>
        ) : null}
      </Dialog>
    </div>
  )
}
