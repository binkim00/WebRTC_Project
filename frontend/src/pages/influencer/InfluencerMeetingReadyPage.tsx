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
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertBanner,
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  MediaDevicePreview,
} from '../../components'
import { useNavigate, useParams } from 'react-router-dom'
import { getAuthSession } from '../../api/authSession'
import { ApiError } from '../../api/ApiError'
import {
  fetchFanMemos,
  fetchMeetingDetail,
  fetchMeetingQueue,
  type FanMemo,
  type MeetingDetail,
  type MeetingQueue,
} from '../../api/fanMeetingParticipants'
import { useMediaDeviceCheck } from '../../hooks/useMediaDeviceCheck'

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
  const [now, setNow] = useState(() => Date.now())

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

  useEffect(() => {
    if (!fanMeetingId) return

    const session = getAuthSession()
    if (!session) return

    const controller = new AbortController()

    void fetchMeetingDetail(fanMeetingId, session.accessToken, controller.signal)
      .then(setMeeting)
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
    const raw = meeting?.operation?.queueOpenAt
    if (!raw) return undefined
    const time = new Date(raw).getTime()
    return Number.isNaN(time) ? undefined : time
  }, [meeting?.operation?.queueOpenAt])

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

  const handleEnterCall = () => {
    if (!fanMeetingId) { return }
    if (!isDeviceChecked || !queue?.currentCall) return
    navigate(
      `/influencer/fan-meetings/${fanMeetingId}/calls/${encodeURIComponent(queue.currentCall.callSessionId)}`
    )
  }

  return (
    <div className="grid gap-8 pb-8">
      {/* 대기열 오픈 전에는 오류 대신 오픈 예정 안내를 표시한다 */}
      {isBeforeQueueOpen ? (
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
              disabled={!isDeviceChecked || !queue?.currentCall}
              leadingIcon={<VideoCamera aria-hidden size={21} weight="bold" />}
              onClick={handleEnterCall}
              size="lg"
            >
              {queue?.currentCall ? '영상 통화 입장' : '팬 호출 대기 중'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
