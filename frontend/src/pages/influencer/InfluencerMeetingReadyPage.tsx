import {
  ArrowRight,
  CalendarBlank,
  Camera,
  CheckCircle,
  ListChecks,
  Microphone,
  NotePencil,
  VideoCamera,
  WarningCircle,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertBanner,
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Dialog,
  MediaDevicePreview,
} from '../../components'
import { useNavigate, useParams } from 'react-router-dom'
import { getAuthSession } from '../../api/authSession'
import { ApiError } from '../../api/ApiError'
import { endFanMeeting, serverLocalDateTimeMs } from '../../api/meetingManagement'
import {
  fetchFanMemos,
  fetchMeetingDetail,
  fetchMeetingQueue,
  type FanMemo,
  type MeetingDetail,
  type MeetingQueue,
} from '../../api/fanMeetingParticipants'
import { isQueueNotInitialized } from '../../api/queue'
import { useMediaDeviceCheck } from '../../hooks/useMediaDeviceCheck'
import { useNowTicker } from '../../hooks/useNowTicker'
import { usePolling } from '../../hooks/usePolling'

type DeviceCheckResult = {
  cameraOk?: boolean
  microphoneOk?: boolean
  speakerOk?: boolean
  networkOk?: boolean
  checkedAt?: string
  /** 장비 점검 화면에서 선택한 장치 ID. 준비실에서 같은 장치로 복원할 때 사용한다. */
  cameraDeviceId?: string
  microphoneDeviceId?: string
  speakerDeviceId?: string
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

function formatScheduledAt(value?: string) {
  if (!value) return '일정 확인 중'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

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
  const [meeting, setMeeting] = useState<MeetingDetail>()
  const [queue, setQueue] = useState<MeetingQueue>()
  const [currentFanMemo, setCurrentFanMemo] = useState<FanMemo>()
  const [error, setError] = useState<string>()
  // 팬미팅 종료 확인 대화상자와 진행 상태다.
  const [endDialogOpen, setEndDialogOpen] = useState(false)
  const [ending, setEnding] = useState(false)
  const [endError, setEndError] = useState<string>()
  // 종료 안내 후 자동 이동할 시각이다. 렌더마다 다시 계산되면 안 되므로 ref로 고정한다.
  const closedRedirectAtRef = useRef<number | undefined>(undefined)
  // 대기열 오픈 시각 도달 여부와 현재 통화 경과 시간을 초 단위로 다시 계산하기 위한 시계다.
  const now = useNowTicker(1_000)

  const deviceCheck = readDeviceCheck(fanMeetingId)
  const isDeviceChecked = isDeviceCheckPassed(deviceCheck)

  // 준비실에서도 카메라 미리보기와 마이크 입력 상태를 실시간으로 보여주기 위해 장비 스트림을 연다.
  const {
    audioLevel,
    errorMessage: mediaErrorMessage,
    start: startMedia,
    status: mediaStatus,
    stream,
  } = useMediaDeviceCheck()

  // 준비실 진입 시 카메라·마이크 권한을 요청하고 미리보기 스트림을 시작한다.
  useEffect(() => {
    void startMedia()
  }, [startMedia])

  /** 현재 스트림에서 카메라 트랙이 정상 동작 중인지 확인한다. */
  const isCameraLive =
    stream?.getVideoTracks().some((track) => track.readyState === 'live') ?? false
  /** 현재 스트림에서 마이크 트랙이 정상 동작 중인지 확인한다. */
  const isMicrophoneLive =
    stream?.getAudioTracks().some((track) => track.readyState === 'live') ?? false

  /**
   * 팬미팅 상세를 다시 읽는다.
   *
   * 이전에는 마운트 시 한 번만 조회해서, 매니저가 팬미팅을 종료해도 준비실은 계속
   * 진행 중인 것처럼 보였다. 종료를 인플루언서가 알 수 있어야 하므로 주기적으로 갱신한다.
   */
  const loadMeeting = useCallback(async (signal?: AbortSignal) => {
    if (!fanMeetingId) return

    const session = getAuthSession()
    if (!session) return

    try {
      setMeeting(await fetchMeetingDetail(fanMeetingId, session.accessToken, signal))
    } catch (reason: unknown) {
      if (signal?.aborted) return
      setError(
        reason instanceof ApiError || reason instanceof TypeError
          ? reason.message
          : '팬미팅 정보를 불러오지 못했습니다.',
      )
    }
  }, [fanMeetingId])

  // 종료·취소를 늦게 알아차리지 않도록 10초마다 상태를 확인한다.
  usePolling(loadMeeting, { intervalMs: 10_000 })

  /** 팬미팅이 끝났거나 취소되어 더 이상 통화를 진행할 수 없는 상태다. */
  const isMeetingClosed = meeting?.status === 'ENDED' || meeting?.status === 'CANCELED'

  /**
   * 팬미팅이 종료되면 안내를 보여 준 뒤 메인으로 보낸다.
   *
   * 종료된 준비실에 계속 머물면 할 수 있는 일이 없다. 다만 즉시 이동하면 왜 화면이 바뀌었는지
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

  const loadCurrentCall = useCallback(async (signal?: AbortSignal) => {
    if (!fanMeetingId) return

    const session = getAuthSession()
    if (!session || (session.role !== 'INFLUENCER' && session.role !== 'SOLO_INFLUENCER')) {
      setError('인플루언서 계정으로 로그인한 뒤 준비실을 이용해 주세요.')
      return
    }

    try {
      setQueue(await fetchMeetingQueue(fanMeetingId, session.accessToken, signal))
      setError(undefined)
    } catch (reason) {
      if (signal?.aborted) return
      // 팬미팅이 종료되면 Redis 대기열이 정리되어 같은 409가 돌아온다.
      // 오픈 전과 마찬가지로 장애가 아니므로 빈 대기열로 두고 오류를 띄우지 않는다.
      if (isQueueNotInitialized(reason)) {
        setQueue(undefined)
        setError(undefined)
        return
      }
      setError(
        reason instanceof ApiError || reason instanceof TypeError
          ? reason.message
          : '현재 통화 정보를 불러오지 못했습니다.',
      )
    }
  }, [fanMeetingId])

  /** 대기열 오픈 시각(밀리초). 상세 정보를 아직 불러오지 못했으면 undefined다. */
  const queueOpenAtMs = useMemo(() => {
    // 서버는 offset 없는 LocalDateTime을 보내므로 KST 기준으로 해석해야 한다.
    const time = serverLocalDateTimeMs(meeting?.operation?.queueOpenAt)
    return Number.isFinite(time) ? time : undefined
  }, [meeting?.operation?.queueOpenAt])

  /** 대기열 오픈 전인지 여부. 오픈 시각 정보가 없으면 기존처럼 바로 폴링한다. */
  const isBeforeQueueOpen = queueOpenAtMs !== undefined && now < queueOpenAtMs

  // 대기열 정보를 3초마다 폴링한다. 오픈 전에는 백엔드가 QUEUE_NOT_INITIALIZED 오류를
  // 반환하므로 폴링하지 않고, 오픈 시각이 지나면 자동으로 폴링을 시작한다.
  //
  // 이전에는 setInterval을 써서 응답을 기다리지 않고 3초마다 요청을 발사했다.
  // 응답이 3초보다 늦으면 요청이 겹치고 먼저 보낸 응답이 나중에 도착해 최신 대기열을
  // 덮어쓸 수 있었다. usePolling은 직렬 폴링이라 이 문제가 발생하지 않는다.
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
        // 메모 조회 실패는 준비실 이용을 막지 않는다.
        if (!controller.signal.aborted) setCurrentFanMemo(undefined)
      })

    return () => controller.abort()
  }, [currentFanId])

  const sessionDurationLabel = useMemo(() => {
    const startedAt = queue?.currentCall?.startedAt
    const endsAt = queue?.currentCall?.endsAt
    if (!startedAt || !endsAt) return '—'

    const diffSec = (new Date(endsAt).getTime() - new Date(startedAt).getTime()) / 1000
    return Number.isFinite(diffSec) && diffSec > 0 ? formatDurationSec(diffSec) : '—'
  }, [queue?.currentCall?.endsAt, queue?.currentCall?.startedAt])

  const elapsedLabel = useMemo(() => {
    const startedAt = queue?.currentCall?.startedAt
    if (!startedAt) return '—'

    const elapsedSec = (now - new Date(startedAt).getTime()) / 1000
    return Number.isFinite(elapsedSec) && elapsedSec >= 0
      ? formatDurationSec(elapsedSec)
      : '—'
  }, [now, queue?.currentCall?.startedAt])

  const handleOpenMemo = () => {
    if (!fanMeetingId || !currentFanId) { return }
    // 통화 요약 조회에는 callSessionId가 필요한데 참가자 응답에는 없다.
    // 진행 중인 통화의 상대 팬을 여는 경우에만 현재 세션을 함께 넘겨 요약 탭이 동작하게 한다.
    const callSessionId = currentEntry?.participantId === queue?.currentCall?.participantId
      ? queue?.currentCall?.callSessionId
      : undefined
    const callSessionQuery = callSessionId
      ? `&callSessionId=${encodeURIComponent(callSessionId)}`
      : ''
    navigate(
      `/influencer/fan-meetings/${fanMeetingId}/fans/${currentFanId}/records?tab=memo${callSessionQuery}`
    )
  }

  const handleOpenFanList = () => {
    if (!fanMeetingId) { return }
    navigate(
      `/influencer/fan-meetings/${fanMeetingId}/fans`
    )
  }

  const handleOpenDeviceCheck = () => {
    if (!fanMeetingId) { return }
    navigate(`/influencer/fan-meetings/${fanMeetingId}/device-check`)
  }

  /**
   * 진행 중인 팬미팅을 종료한다.
   *
   * 백엔드 `end`는 `requireMeetingOperator`로 **담당 매니저 또는 진행 인플루언서**를 허용한다.
   * 즉 소속 인플루언서도 종료할 권한이 있는데, 지금까지 프론트가 매니저 콘솔에만 종료 버튼을 두어
   * 소속 인플루언서는 자기 팬미팅을 끝낼 방법이 없었다. (매니저 콘솔은 솔로 계정만 접근 가능)
   */
  const handleEndMeeting = async () => {
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
          : '팬미팅을 종료하지 못했습니다.',
      )
    } finally {
      setEnding(false)
    }
  }

  const handleEnterCall = () => {
    if (!fanMeetingId) { return }
    // 종료된 팬미팅에서는 서버가 LiveKit Room을 이미 삭제했으므로 입장을 막는다.
    if (isMeetingClosed) return
    if (!isDeviceChecked || !queue?.currentCall) return
    navigate(
      `/influencer/fan-meetings/${fanMeetingId}/calls/${encodeURIComponent(queue.currentCall.callSessionId)}`
    )
  }

  return (
    <div className="grid gap-8 pb-8">
      {/* 종료·취소는 오류가 아니라 확정된 결과이므로 다른 안내보다 먼저 알린다 */}
      {isMeetingClosed ? (
        <AlertBanner
          title={meeting?.status === 'CANCELED' ? '팬미팅이 취소되었습니다' : '팬미팅이 종료되었습니다'}
          variant="info"
        >
          <p>
            더 이상 통화를 진행할 수 없습니다. 대기열과 통화 방이 모두 정리되었으니
            진행 결과는 팬미팅 이력에서 확인해 주세요.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button onClick={() => navigate('/', { replace: true })} size="sm">
              메인으로 이동
            </Button>
            {closedRedirectRemainingSec !== undefined && closedRedirectRemainingSec > 0 ? (
              <span className="text-sm">
                {closedRedirectRemainingSec}초 후 메인으로 자동 이동합니다.
              </span>
            ) : null}
          </div>
        </AlertBanner>
      ) : isBeforeQueueOpen ? (
        <AlertBanner title="대기열이 아직 열리지 않았습니다" variant="info">
          {formatScheduledAt(meeting?.operation?.queueOpenAt)} 오픈 예정입니다. 오픈되면
          자동으로 대기열 정보를 불러옵니다. 그동안 카메라와 마이크 상태를 점검해 주세요.
        </AlertBanner>
      ) : error ? (
        <AlertBanner title="통화 정보를 확인할 수 없습니다" variant="error">
          {error}
        </AlertBanner>
      ) : null}

      <header className="grid gap-3">
        <h1 className="text-4xl font-black leading-tight tracking-[-0.04em]">
          팬미팅 진행
        </h1>
        <p className="text-[var(--color-text-secondary)]">
          화면과 팬 정보를 확인한 뒤 영상 통화에 입장하세요.
        </p>
      </header>

      <Card className="overflow-hidden">
        <div className="grid lg:grid-cols-[minmax(300px,1fr)_minmax(0,1.75fr)]">
          <div className="grid gap-5 p-6 lg:border-r lg:border-[var(--color-divider)] lg:p-8">
            <Badge className="w-fit" variant="primary">
              {meeting?.status === 'LIVE' ? '진행 중' : '오늘 진행'}
            </Badge>
            <h2 className="text-3xl font-black tracking-[-0.04em]">
              {meeting?.title ?? '팬미팅 정보를 불러오는 중'}
            </h2>
            <dl className="flex flex-wrap gap-x-10 gap-y-4">
              <div>
                <dt className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                  인플루언서
                </dt>
                <dd className="mt-2 font-extrabold">
                  {meeting?.influencer.influencerName ?? '확인 중'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                  진행 일시
                </dt>
                <dd className="mt-2 flex items-center gap-2 font-extrabold">
                  <CalendarBlank aria-hidden size={20} weight="bold" />
                  {formatScheduledAt(meeting?.scheduledStartAt)}
                </dd>
              </div>
            </dl>
          </div>

          <dl className="grid border-t border-[var(--color-divider)] sm:grid-cols-3 lg:border-t-0">
            <div className="grid content-center gap-3 p-6 sm:border-r sm:border-[var(--color-divider)] lg:p-8">
              <dt className="text-sm font-semibold text-[var(--color-text-tertiary)]">
                현재 통화 세션 시간
              </dt>
              <dd className="text-2xl font-black">{sessionDurationLabel}</dd>
            </div>
            <div className="grid content-center gap-3 border-t border-[var(--color-divider)] p-6 sm:border-r sm:border-t-0 lg:p-8">
              <dt className="text-sm font-semibold text-[var(--color-text-tertiary)]">
                완료 세션
              </dt>
              <dd className="text-2xl font-black">
                {completedFanCount}
                <span className="ml-1 text-base text-[var(--color-text-tertiary)]">
                  /{totalFanCount}
                </span>
              </dd>
            </div>
            <div className="grid content-center gap-3 border-t border-[var(--color-divider)] p-6 sm:border-t-0 lg:p-8">
              <dt className="text-sm font-semibold text-[var(--color-text-tertiary)]">
                현재 통화 경과 시간
              </dt>
              <dd className="text-2xl font-black">{elapsedLabel}</dd>
            </div>
          </dl>
        </div>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.7fr)_420px]">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="flex items-center gap-2 text-lg font-extrabold">
              <VideoCamera aria-hidden size={22} weight="fill" />
              현재 화면
            </h2>
            <div className="flex items-center gap-3">
              <span
                className={[
                  'inline-flex size-10 items-center justify-center rounded-[var(--radius-control)]',
                  isDeviceChecked
                    ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]'
                    : 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
                ].join(' ')}
              >
                {isDeviceChecked ? (
                  <CheckCircle aria-hidden size={22} weight="fill" />
                ) : (
                  <WarningCircle aria-hidden size={22} weight="fill" />
                )}
              </span>
              <span>
                <span className="block text-xs font-semibold text-[var(--color-text-tertiary)]">
                  장비 상태
                </span>
                <span className="mt-1 block font-extrabold">
                  {isDeviceChecked ? '점검 완료' : '점검 필요'}
                </span>
              </span>
              {isDeviceChecked ? null : (
                <Button onClick={handleOpenDeviceCheck} size="sm" variant="secondary">
                  장비 점검하기
                </Button>
              )}
            </div>
          </CardHeader>

          {/* 준비실에서 다시 연 카메라 스트림을 실시간 미리보기로 표시한다 */}
          <div className="relative">
            <MediaDevicePreview className="rounded-none shadow-none" stream={stream} />
            {stream ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 to-transparent p-6 pt-16">
                <p className="text-lg font-extrabold text-white">
                  {meeting?.influencer.influencerName ?? ''}
                </p>
                <p className="mt-1 text-sm text-slate-300">카메라 미리보기</p>
              </div>
            ) : null}
          </div>

          {/* 카메라를 열지 못한 경우 원인을 안내한다 */}
          {mediaErrorMessage ? (
            <div className="border-t border-[var(--color-divider)] p-5 sm:p-6">
              <AlertBanner title="카메라를 시작하지 못했습니다" variant="warning">
                {mediaErrorMessage}
              </AlertBanner>
            </div>
          ) : null}

          {/* 카메라·마이크 연결 상태와 마이크 입력 레벨을 표시한다 */}
          <div className="grid gap-5 border-t border-[var(--color-divider)] p-5 sm:grid-cols-2 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-surface-page)] text-[var(--color-text-secondary)]">
                <Camera aria-hidden size={21} weight="bold" />
              </span>
              <div>
                <p className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                  카메라
                </p>
                <p
                  className={[
                    'mt-1 text-sm font-extrabold',
                    isCameraLive
                      ? 'text-[var(--color-success)]'
                      : 'text-[var(--color-text-secondary)]',
                  ].join(' ')}
                >
                  {isCameraLive
                    ? '연결됨'
                    : mediaStatus === 'requesting'
                      ? '연결 중'
                      : '확인 필요'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-surface-page)] text-[var(--color-text-secondary)]">
                <Microphone aria-hidden size={21} weight="bold" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                    마이크
                  </p>
                  <p
                    className={[
                      'text-sm font-extrabold',
                      isMicrophoneLive
                        ? 'text-[var(--color-success)]'
                        : 'text-[var(--color-text-secondary)]',
                    ].join(' ')}
                  >
                    {isMicrophoneLive
                      ? audioLevel > 0.55
                        ? '입력 좋음'
                        : audioLevel > 0.15
                          ? '입력 보통'
                          : '입력 대기'
                      : mediaStatus === 'requesting'
                        ? '연결 중'
                        : '확인 필요'}
                  </p>
                </div>
                {/* 마이크 입력 크기를 실시간 막대로 시각화한다 */}
                <div
                  aria-label={`마이크 입력 ${Math.round(audioLevel * 100)}%`}
                  className="mt-2 flex items-end gap-1"
                >
                  {Array.from({ length: 16 }, (_, index) => (
                    <span
                      aria-hidden
                      className={
                        index / 16 < audioLevel
                          ? 'h-2 flex-1 rounded-sm bg-[var(--color-primary-coral)]'
                          : 'h-1.5 flex-1 rounded-sm bg-[var(--color-divider)]'
                      }
                      key={index}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="flex items-center justify-between gap-4">
            <h2 className="font-extrabold">팬 진행 순서</h2>
            <p className="text-2xl font-black text-[var(--color-primary-coral)]">
              {completedFanCount}
              <span className="ml-1 text-sm text-[var(--color-text-tertiary)]">
                / {totalFanCount}명
              </span>
            </p>
          </CardHeader>

          <CardContent className="grid gap-6">
            {currentFanName ? (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold text-[var(--color-primary-coral)]">
                      현재 팬
                    </p>
                    <p className="mt-2 text-2xl font-black">{currentFanName}</p>
                  </div>
                  {currentEntry ? (
                    <div className="text-right">
                      <p className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                        현재 순번
                      </p>
                      <p className="mt-2 text-xl font-black text-[var(--color-primary-coral)]">
                        {currentEntry.position}번째
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center gap-4">
                  <Avatar
                    className="size-16 rounded-[var(--radius-panel)]"
                    name={currentFanName}
                    size="lg"
                  />
                  <dl className="flex gap-8">
                    <div>
                      <dt className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                        최근 메모
                      </dt>
                      <dd className="mt-1 flex items-center gap-1.5 font-extrabold">
                        <NotePencil aria-hidden size={18} weight="bold" />
                        {currentFanMemo ? '있음' : '없음'}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-[var(--radius-panel)] bg-[var(--color-surface-page)] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-extrabold">기존 메모</p>
                    <button
                      className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--color-primary-coral)]"
                      onClick={handleOpenMemo}
                      type="button"
                    >
                      <NotePencil aria-hidden size={17} weight="bold" />
                      메모 확인하기
                    </button>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                    {currentFanMemo?.content ?? '작성된 메모가 없습니다.'}
                  </p>
                </div>
              </>
            ) : (
              <p className="py-4 text-sm text-[var(--color-text-secondary)]">
                현재 통화 중인 팬이 없습니다. 팬을 호출하면 정보가 표시됩니다.
              </p>
            )}
          </CardContent>

          {nextEntry ? (
            <div className="border-t border-[var(--color-divider)] p-5 sm:p-6">
              <div className="flex items-center gap-4">
                <Avatar name={nextEntry.nickname} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                    다음 팬
                  </p>
                  <p className="mt-1 font-extrabold">{nextEntry.nickname}</p>
                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                    {nextEntry.position}번째 순서
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 border-t border-[var(--color-divider)] p-5 sm:p-6">
            <Button
              leadingIcon={<ListChecks aria-hidden size={20} weight="bold" />}
              onClick={handleOpenFanList}
              trailingIcon={<ArrowRight aria-hidden size={18} weight="bold" />}
              variant="secondary"
            >
              팬 리스트 확인하기
            </Button>

            {isDeviceChecked ? null : (
              <AlertBanner title="장비 점검이 필요합니다" variant="warning">
                영상 통화에 입장하기 전에 장비 점검을 완료해 주세요.
              </AlertBanner>
            )}

            <Button
              className="w-full shadow-[var(--shadow-final-cta)]"
              disabled={!isDeviceChecked || !queue?.currentCall || isMeetingClosed}
              leadingIcon={<VideoCamera aria-hidden size={21} weight="bold" />}
              onClick={handleEnterCall}
              size="lg"
            >
              {isMeetingClosed
                ? '종료된 팬미팅'
                : queue?.currentCall
                  ? '영상 통화 입장'
                  : '팬 호출 대기 중'}
            </Button>

            {/* 소속 인플루언서는 매니저 콘솔에 접근할 수 없으므로 이 화면에서 직접 종료해야 한다. */}
            {isMeetingClosed ? null : (
              <Button
                disabled={meeting?.status !== 'LIVE'}
                onClick={() => setEndDialogOpen(true)}
                variant="danger"
              >
                팬미팅 종료
              </Button>
            )}

            {endError ? (
              <AlertBanner title="팬미팅을 종료하지 못했습니다" variant="error">
                {endError}
              </AlertBanner>
            ) : null}
          </div>
        </Card>
      </div>

      <Dialog
        description="진행 중인 모든 통화가 강제로 마감되고 대기열이 정리됩니다."
        footer={
          <>
            <Button
              disabled={ending}
              onClick={() => setEndDialogOpen(false)}
              variant="ghost"
            >
              취소
            </Button>
            <Button loading={ending} onClick={() => void handleEndMeeting()} variant="danger">
              종료하기
            </Button>
          </>
        }
        onOpenChange={setEndDialogOpen}
        open={endDialogOpen}
        title="팬미팅을 종료할까요?"
      >
        <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
          종료하면 되돌릴 수 없습니다. 아직 통화하지 못한 팬이 남아 있는지 대기열을 확인해 주세요.
        </p>
      </Dialog>
    </div>
  )
}
