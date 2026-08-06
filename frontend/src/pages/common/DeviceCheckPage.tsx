import { PlayIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import { isClosedFanMeetingStatus } from '../../api/fanMeetings'
import { enterQueue, interpretQueueEnterError } from '../../api/queue'
import { saveDeviceCheck } from '../../api/deviceChecks'
import { fetchMeetingDetail } from '../../api/fanMeetingParticipants'
import { AlertBanner, Button, MediaDevicePreview, Select } from '../../components'
import type { FeedbackVariant } from '../../components'
import { InvalidRouteState } from '../../components/routing/ScreenPage'
import {
  useMediaDeviceCheck,
  type MediaCheckStatus,
} from '../../hooks/useMediaDeviceCheck'
import { translate, useTranslation } from '../../i18n'

/** 권한·장치 문제 상태의 안내 배너 문구다. 정상 흐름에서는 배너를 띄우지 않는다. */
const statusContent = (): Record<
  MediaCheckStatus,
  { title: string; message: string; variant: FeedbackVariant }
> => ({
  idle: {
    title: translate('deviceCheckPage.t66'),
    message: translate('deviceCheckPage.t67'),
    variant: 'info',
  },
  requesting: {
    title: translate('deviceCheckPage.t68'),
    message: translate('deviceCheckPage.t69'),
    variant: 'warning',
  },
  ready: {
    title: translate('deviceCheckPage.t70'),
    message: translate('deviceCheckPage.t71'),
    variant: 'success',
  },
  denied: { title: translate('deviceCheckPage.t72'), message: '', variant: 'error' },
  'no-device': { title: translate('deviceCheckPage.t73'), message: '', variant: 'error' },
  unsupported: { title: translate('deviceCheckPage.t74'), message: '', variant: 'error' },
  error: { title: translate('deviceCheckPage.t75'), message: '', variant: 'error' },
})

type SinkSelectableAudioElement = HTMLAudioElement & {
  setSinkId: (sinkId: string) => Promise<void>
}

function createDeviceOptions(devices: readonly MediaDeviceInfo[], fallbackLabel: string) {
  return devices.map((device, index) => ({
    label: device.label || `${fallbackLabel} ${index + 1}`,
    value: device.deviceId,
  }))
}

/**
 * 원시 마이크 레벨(평상시 말소리가 0.1 안팎에 머무는 좁은 대역)을 표시용 감도로 보정한다.
 *
 * 지수 0.6 곡선으로 저역을 끌어올려 평소 말소리는 40~70%, 큰 소리는 끝까지 도달하고,
 * 0.02 미만은 노이즈로 보고 0으로 잘라 무음에서 막대가 어른거리지 않게 한다.
 */
function scaleMicLevel(raw: number): number {
  if (raw < 0.02) return 0
  return Math.min(1, Math.pow(raw / 0.28, 0.6))
}

/**
 * 상승은 즉시, 하강은 부드럽게 따라가는 표시용 레벨이다.
 *
 * 원시 레벨이 프레임마다 갱신되므로 이 효과도 프레임 단위로 돌며,
 * 내려갈 때만 이전 값에서 12%씩 감쇠해 "잔향이 남는" 느낌을 만든다.
 */
function useMicDisplayLevel(raw: number): number {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    const target = scaleMicLevel(raw)
    setDisplay((prev) =>
      target >= prev ? target : prev < 0.02 ? 0 : prev + (target - prev) * 0.12,
    )
  }, [raw])

  return display
}

/** 항목 제목·상태 표기를 좌우로 놓는 dc.html 공통 행이다. */
function RowHeading({ label, htmlFor, ok, okLabel, pendingLabel }: {
  label: string
  htmlFor?: string
  ok: boolean
  okLabel: string
  pendingLabel: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <label className="text-[15px] font-extrabold" htmlFor={htmlFor}>
        {label}
      </label>
      <span
        className={`whitespace-nowrap text-[13px] font-bold ${ok ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]'}`}
      >
        {ok ? okLabel : pendingLabel}
      </span>
    </div>
  )
}

export function DeviceCheckPage() {
  const { t } = useTranslation()
  const { fanMeetingId } = useParams()
  const navigate = useNavigate()
  const [isPlayingTestSound, setIsPlayingTestSound] = useState(false)
  const [speakerTestPassed, setSpeakerTestPassed] = useState(false)
  const [speakerTestError, setSpeakerTestError] = useState<string>()
  const [networkReady, setNetworkReady] = useState(() => navigator.onLine)
  const [isEnteringQueue, setIsEnteringQueue] = useState(false)
  const [queueError, setQueueError] = useState<string>()
  const [deviceCheckWarning, setDeviceCheckWarning] = useState<string>()
  // 종료·취소 여부를 확인하기 전(undefined)에는 아직 판단하지 않는다.
  // 조회에 실패해도 false로 확정해 점검 자체가 잠기지 않게 한다.
  const [meetingClosed, setMeetingClosed] = useState<boolean>()
  const {
    audioLevel,
    cameras,
    errorMessage,
    microphones,
    speakers,
    selectedCameraId,
    selectedMicrophoneId,
    selectedSpeakerId,
    selectCamera,
    selectMicrophone,
    selectSpeaker,
    start,
    status,
    stream,
  } = useMediaDeviceCheck()

  useEffect(() => {
    // 장비 점검 화면에 진입하면 즉시 권한 요청을 시작해 별도 클릭 단계를 없앤다.
    // 브라우저가 자동 요청을 차단한 경우에는 아래 재시도 버튼으로 다시 요청할 수 있다.
    // 끝난 팬미팅에서는 어차피 입장할 수 없으므로 카메라·마이크를 켜지 않는다.
    if (status === 'idle' && meetingClosed === false) void start()
  }, [meetingClosed, start, status])

  useEffect(() => {
    // 브라우저의 온라인 상태가 바뀌면 입장 가능 여부도 즉시 다시 계산한다.
    const handleOnline = () => setNetworkReady(true)
    const handleOffline = () => setNetworkReady(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    // 출력 장치를 바꿨다면 새 장치에서 소리가 나는지 다시 확인해야 한다.
    setSpeakerTestPassed(false)
    setSpeakerTestError(undefined)
  }, [selectedSpeakerId])

  const [meetingTitle, setMeetingTitle] = useState<string>()
  // 훅은 조기 return(잘못된 라우트) 앞에서 항상 같은 순서로 호출되어야 한다.
  const micLevel = useMicDisplayLevel(audioLevel)

  useEffect(() => {
    if (!fanMeetingId?.trim()) return

    const controller = new AbortController()
    const session = getAuthSession()
    // 로그인 정보가 없으면 상태를 확인할 수 없다. 아래 입장 버튼이 로그인을 안내하도록
    // 종료 여부는 '아님'으로 확정해 점검 화면 자체는 그대로 연다.
    if (!session) {
      setMeetingClosed(false)
      return () => controller.abort()
    }

    void fetchMeetingDetail(fanMeetingId, session.accessToken, controller.signal)
      .then((meeting) => {
        setMeetingTitle(meeting.title)
        setMeetingClosed(isClosedFanMeetingStatus(meeting.status))
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setMeetingClosed(false)
      })

    return () => controller.abort()
  }, [fanMeetingId])

  if (!fanMeetingId?.trim()) {
    return (
      <InvalidRouteState
        message={t('deviceCheckPage.t1')}
        title={t('deviceCheckPage.t2')}
      />
    )
  }

  const meetingId = fanMeetingId
  const session = getAuthSession()

  // 끝난 팬미팅은 서버가 장비 점검 저장과 대기실 입장을 모두 막는다.
  // 점검 화면을 그대로 두면 팬이 끝까지 점검한 뒤에야 실패를 보게 되므로 여기서 갈라 준다.
  if (meetingClosed) {
    const isFan = session?.role === 'FAN'

    return (
      <div>
        <p className="text-sm font-bold text-[var(--color-text-muted)]">
          {meetingTitle ?? t('deviceCheckPage.t78')}
        </p>
        <h1 className="mt-3 text-[32px] font-black tracking-[-0.04em]">
          {t('deviceCheckPage.t79')}
        </h1>
        <p className="mt-2.5 max-w-[52ch] text-[17px] font-medium leading-[1.6] text-[var(--color-text-body)]">
          {isFan ? t('deviceCheckPage.t80') : t('deviceCheckPage.t81')}
        </p>
        <Link
          className="mj-font-emphasis mt-7 inline-flex min-h-[54px] items-center rounded-[10px] border border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] px-7 text-[17px] text-white transition-colors hover:bg-[var(--color-primary-coral-hover)]"
          to={
            isFan
              ? `/fan/fan-meetings/${encodeURIComponent(meetingId)}/complete`
              : '/influencer/my-fan-meetings'
          }
        >
          {isFan ? t('deviceCheckPage.t82') : t('deviceCheckPage.t83')}
        </Link>
      </div>
    )
  }

  const currentStatus = statusContent()[status]
  const isRequesting = status === 'requesting'
  const isReady = status === 'ready'
  const cameraOptions = createDeviceOptions(cameras, t('deviceCheckPage.t17'))
  const microphoneOptions = createDeviceOptions(microphones, t('deviceCheckPage.t18'))
  const speakerOptions =
    speakers.length > 0
      ? createDeviceOptions(speakers, t('deviceCheckPage.t19'))
      : [{ label: t('deviceCheckPage.t20'), value: 'default' }]
  const videoTrackReady = Boolean(
    stream?.getVideoTracks().some((track) => track.readyState === 'live'),
  )
  const audioTrackReady = Boolean(
    stream?.getAudioTracks().some((track) => track.readyState === 'live'),
  )
  const micActive = micLevel > 0.25
  const allReady = videoTrackReady && audioTrackReady && speakerTestPassed && networkReady

  const summaryItems = [
    {
      label: t('deviceCheckPage.t21'),
      value: videoTrackReady ? t('deviceCheckPage.t22') : t('deviceCheckPage.t23'),
    },
    {
      label: t('deviceCheckPage.t24'),
      value: audioTrackReady ? t('deviceCheckPage.t25') : t('deviceCheckPage.t26'),
    },
    {
      label: t('deviceCheckPage.t27'),
      value: speakerTestPassed ? t('deviceCheckPage.t28') : t('deviceCheckPage.t29'),
    },
    {
      label: t('deviceCheckPage.t30'),
      value: networkReady ? t('deviceCheckPage.t31') : t('deviceCheckPage.t32'),
    },
  ]
  const missingItems = summaryItems
    .filter((_, index) =>
      [!videoTrackReady, !audioTrackReady, !speakerTestPassed, !networkReady][index],
    )
    .map((item) => item.label)

  async function playTestSound() {
    if (isPlayingTestSound) return

    setIsPlayingTestSound(true)
    setSpeakerTestError(undefined)

    const audio = new Audio()
    let audioContext: AudioContext | null = null
    let oscillator: OscillatorNode | null = null

    try {
      audioContext = new AudioContext()
      oscillator = audioContext.createOscillator()
      const gain = audioContext.createGain()
      const destination = audioContext.createMediaStreamDestination()

      oscillator.frequency.value = 620
      gain.gain.setValueAtTime(0.12, audioContext.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.8)
      oscillator.connect(gain)
      gain.connect(destination)
      audio.srcObject = destination.stream

      if (
        selectedSpeakerId &&
        selectedSpeakerId !== 'default' &&
        'setSinkId' in audio &&
        typeof audio.setSinkId === 'function'
      ) {
        await (audio as SinkSelectableAudioElement).setSinkId(selectedSpeakerId)
      }

      await audio.play()
      oscillator.start()
      oscillator.stop(audioContext.currentTime + 0.8)

      await new Promise<void>((resolve) => window.setTimeout(resolve, 900))
      setSpeakerTestPassed(true)
    } catch (error) {
      console.warn(t('deviceCheckPage.t33'), error)
      setSpeakerTestPassed(false)
      setSpeakerTestError(
        t('deviceCheckPage.t34'),
      )
    } finally {
      try {
        oscillator?.stop()
      } catch {
        // 이미 종료된 oscillator는 다시 stop할 수 없습니다.
      }
      audio.pause()
      audio.srcObject = null
      await audioContext?.close().catch(() => undefined)
      setIsPlayingTestSound(false)
    }
  }

  /** 장비 점검 결과를 저장한 뒤 역할에 따라 준비실(인플루언서) 또는 대기실(팬)로 이동한다. */
  async function handleEnterQueue() {
    if (isEnteringQueue || meetingClosed) return

    if (!session) {
      setQueueError(t('deviceCheckPage.t35'))
      return
    }

    const isInfluencerRole =
      session.role === 'INFLUENCER' || session.role === 'SOLO_INFLUENCER'

    if (!isInfluencerRole && session.role !== 'FAN') {
      setQueueError(t('deviceCheckPage.t36'))
      return
    }

    setIsEnteringQueue(true)
    setQueueError(undefined)
    setDeviceCheckWarning(undefined)

    // 장비 점검 결과를 기록한다. 서버 저장에 실패해도 입장은 막지 않는다.
    // 준비실·대기실에서 같은 장치로 미리보기를 복원할 수 있도록 선택한 장치 ID도 함께 남긴다.
    const checkRecord = {
      cameraOk: videoTrackReady,
      microphoneOk: audioTrackReady,
      speakerOk: speakerTestPassed,
      networkOk: networkReady,
      checkedAt: new Date().toISOString(),
      cameraDeviceId: selectedCameraId,
      microphoneDeviceId: selectedMicrophoneId,
      speakerDeviceId: selectedSpeakerId,
    }

    try {
      window.sessionStorage.setItem(
        `melly-device-check:${meetingId}`,
        JSON.stringify(checkRecord),
      )
    } catch {
      // sessionStorage 저장 실패는 입장 흐름에 영향을 주지 않는다.
    }

    try {
      await saveDeviceCheck(
        meetingId,
        {
          cameraOk: checkRecord.cameraOk,
          microphoneOk: checkRecord.microphoneOk,
          speakerOk: checkRecord.speakerOk,
          networkOk: checkRecord.networkOk,
        },
        session.accessToken,
      )
    } catch (error) {
      // 점검하는 사이 팬미팅이 끝났다면 입장까지 시도하지 않고 종료 안내로 전환한다.
      if (error instanceof ApiError && error.code === 'FAN_MEETING_CLOSED') {
        setMeetingClosed(true)
        setIsEnteringQueue(false)
        return
      }
      // 참가자 전용 저장 API가 인플루언서 요청을 거부할 수 있으므로 팬에게만 경고를 보여준다.
      if (!isInfluencerRole) {
        setDeviceCheckWarning(
          t('deviceCheckPage.t37'),
        )
      }
    }

    // 인플루언서는 대기열 입장 없이 준비실로 이동한다.
    if (isInfluencerRole) {
      setIsEnteringQueue(false)
      navigate(`/influencer/fan-meetings/${encodeURIComponent(meetingId)}/ready`)
      return
    }

    try {
      await enterQueue(meetingId, session.accessToken)
      navigate(`/fan/fan-meetings/${encodeURIComponent(meetingId)}/waiting`)
    } catch (error) {
      // 서버는 "이미 입장함"과 "오픈 전·대기열 미초기화"를 모두 409로 반환한다.
      // ErrorCode로 구분해 재입장은 대기실로 보내고, 실제로 막힌 팬에게는 원인을 남긴다.
      const { alreadyEntered, message } = interpretQueueEnterError(error)
      if (alreadyEntered) {
        navigate(`/fan/fan-meetings/${encodeURIComponent(meetingId)}/waiting`)
        return
      }
      if (error instanceof ApiError && error.code === 'FAN_MEETING_CLOSED') {
        setMeetingClosed(true)
        return
      }

      setQueueError(message)
    } finally {
      setIsEnteringQueue(false)
    }
  }

  return (
    <div>
      <div>
        <p className="text-sm font-bold text-[var(--color-text-muted)]">
          {meetingTitle ? t('deviceCheckPage.t76', { p0: meetingTitle }) : t('deviceCheckPage.t38')}
        </p>
        <h1 className="mt-3 text-[32px] font-black tracking-[-0.04em]">
          {t('deviceCheckPage.t3')}
        </h1>
        <p className="mt-2.5 text-[17px] font-medium leading-[1.6] text-[var(--color-text-body)]">
          {t('deviceCheckPage.t4')}
        </p>
      </div>

      <div className="mt-[30px] grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_416px] lg:gap-11">
        <div className="min-w-0">
          <section aria-labelledby="ec-cam">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-extrabold tracking-[-0.028em]" id="ec-cam">
                {t('deviceCheckPage.t5')}
              </h2>
              <p
                className={`text-sm font-bold ${videoTrackReady ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]'}`}
              >
                {videoTrackReady ? t('deviceCheckPage.t39') : t('deviceCheckPage.t40')}
              </p>
            </div>
            {/* 점검을 통과하면 1px 코랄 테두리 — 이 화면에 허용된 유일한 브랜드 제스처다. (강도 2) */}
            <div
              className={`mt-3.5 overflow-hidden rounded-[10px] border bg-[var(--color-surface-muted)] ${videoTrackReady ? 'border-[var(--color-primary-coral)]' : 'border-[var(--color-border-control)]'}`}
            >
              <MediaDevicePreview className="rounded-none shadow-none" stream={stream} />
            </div>
            <p className="mt-2.5 text-sm font-medium text-[var(--color-text-muted)]">
              {t('deviceCheckPage.t6')}
            </p>
          </section>

          <section
            aria-labelledby="ec-sum"
            className="mt-8 border-t border-[var(--color-divider)] pt-6"
          >
            <h2 className="text-xl font-extrabold tracking-[-0.03em]" id="ec-sum">
              {allReady ? t('deviceCheckPage.t41') : t('deviceCheckPage.t42')}
            </h2>
            <p className="mt-2 text-base font-medium leading-[1.6] text-[var(--color-text-muted)]">
              {allReady
                ? t('deviceCheckPage.t43')
                : currentStatus.message}
            </p>
            <dl className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
              {summaryItems.map((item, index) => (
                <div
                  className={
                    index
                      ? 'py-2 sm:px-5 xl:border-l xl:border-[var(--color-divider)] xl:py-0'
                      : 'py-2 sm:pr-5 xl:py-0'
                  }
                  key={item.label}
                >
                  <dt className="text-[13px] font-bold text-[var(--color-text-muted)]">
                    {item.label}
                  </dt>
                  <dd className="mt-1.5 text-[15px] font-bold">{item.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <aside
          aria-labelledby="ec-set"
          className="min-w-0 rounded-[10px] border border-[var(--color-divider)] p-[22px]"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-extrabold tracking-[-0.028em]" id="ec-set">
              {t('deviceCheckPage.t7')}
            </h2>
            <p
              className={`whitespace-nowrap text-sm font-bold ${allReady ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]'}`}
            >
              {allReady ? t('deviceCheckPage.t44') : t('deviceCheckPage.t45')}
            </p>
          </div>

          {!isReady ? (
            <AlertBanner className="mt-4" title={currentStatus.title} variant={currentStatus.variant}>
              {errorMessage ?? currentStatus.message}
            </AlertBanner>
          ) : null}

          <div className="mt-5 flex items-baseline justify-between gap-3 border-t border-[var(--color-divider)] pt-4">
            <div>
              <p className="text-[15px] font-extrabold">{t('deviceCheckPage.t8')}</p>
              <p className="mt-[5px] text-sm font-medium leading-[1.55] text-[var(--color-text-muted)]">
                {networkReady
                  ? t('deviceCheckPage.t46')
                  : t('deviceCheckPage.t47')}
              </p>
            </div>
            <p
              className={`whitespace-nowrap text-sm font-bold ${networkReady ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}
            >
              {networkReady ? t('deviceCheckPage.t48') : t('deviceCheckPage.t49')}
            </p>
          </div>

          <div className="mt-5 border-t border-[var(--color-divider)] pt-[18px]">
            <RowHeading
              htmlFor="ec-camera"
              label={t('deviceCheckPage.t9')}
              ok={videoTrackReady}
              okLabel={t('deviceCheckPage.t50')}
              pendingLabel={t('deviceCheckPage.t51')}
            />
            <Select
              containerClassName="mt-[9px] [&_label]:sr-only"
              disabled={!isReady || cameraOptions.length === 0}
              id="ec-camera"
              label={t('deviceCheckPage.t10')}
              onChange={(event) => void selectCamera(event.target.value)}
              options={cameraOptions}
              value={selectedCameraId}
            />
          </div>

          <div className="mt-5 border-t border-[var(--color-divider)] pt-[18px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex items-center gap-2">
                <label className="text-[15px] font-extrabold" htmlFor="ec-mic">
                  {t('deviceCheckPage.t11')}
                </label>
                {/* 입력이 감지되면 인디고로 빛나는 실시간 인디케이터. 크기도 레벨을 따라 살짝 커진다. */}
                <span
                  aria-hidden="true"
                  className={`size-2 rounded-full transition-[background-color,box-shadow] duration-150 motion-reduce:transform-none ${
                    micActive
                      ? 'bg-[var(--color-focus-indigo)] shadow-[0_0_8px_2px_var(--color-focus-ring)]'
                      : 'bg-[var(--color-border-control)]'
                  }`}
                  style={{ transform: `scale(${1 + Math.min(0.5, micLevel * 0.5)})` }}
                />
              </span>
              <span
                className={`whitespace-nowrap text-[13px] font-bold ${audioTrackReady ? 'text-[var(--color-focus-indigo)]' : 'text-[var(--color-text-muted)]'}`}
              >
                {audioTrackReady ? t('deviceCheckPage.t52') : t('deviceCheckPage.t53')}
              </span>
            </div>
            <Select
              containerClassName="mt-[9px] [&_label]:sr-only"
              disabled={!isReady || microphoneOptions.length === 0}
              id="ec-mic"
              label={t('deviceCheckPage.t12')}
              onChange={(event) => void selectMicrophone(event.target.value)}
              options={microphoneOptions}
              value={selectedMicrophoneId}
            />
          </div>

          <div className="mt-5 border-t border-[var(--color-divider)] pt-[18px]">
            <RowHeading
              htmlFor="ec-speaker"
              label={t('deviceCheckPage.t13')}
              ok={speakerTestPassed}
              okLabel={t('deviceCheckPage.t54')}
              pendingLabel={t('deviceCheckPage.t55')}
            />
            <Select
              containerClassName="mt-[9px] [&_label]:sr-only"
              disabled={!isReady}
              id="ec-speaker"
              label={t('deviceCheckPage.t14')}
              onChange={(event) => selectSpeaker(event.target.value)}
              options={speakerOptions}
              value={selectedSpeakerId || 'default'}
            />
            {/* 선택 요소로 오인되지 않도록 채움색 CTA로 구분한다. 재생 후에는 완료 피드백 상태로 남는다. */}
            <button
              aria-live="polite"
              className={`mj-font-label mt-3 inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border text-[15px] transition-colors disabled:cursor-not-allowed ${
                speakerTestPassed && !isPlayingTestSound
                  ? 'border-[var(--color-success-border)] bg-[var(--color-success-soft)] text-[var(--color-success)]'
                  : 'border-[var(--color-focus-indigo)] bg-[var(--color-focus-indigo)] text-white hover:bg-[color-mix(in_srgb,var(--color-focus-indigo)_88%,#000)] disabled:border-[var(--color-border-control)] disabled:bg-[var(--color-surface-subtle)] disabled:text-[var(--color-text-muted)]'
              }`}
              disabled={!isReady || isPlayingTestSound}
              onClick={() => void playTestSound()}
              type="button"
            >
              {speakerTestPassed && !isPlayingTestSound ? null : (
                <PlayIcon aria-hidden size={17} weight="fill" />
              )}
              {isPlayingTestSound
                ? t('deviceCheckPage.t56')
                : speakerTestPassed
                  ? t('deviceCheckPage.t57')
                  : t('deviceCheckPage.t58')}
            </button>
            <p aria-live="polite" className="mt-2 text-sm font-medium leading-[1.55] text-[var(--color-text-muted)]">
              {speakerTestPassed && !isPlayingTestSound
                ? t('deviceCheckPage.t59')
                : t('deviceCheckPage.t60')}
            </p>
            {speakerTestError ? (
              <p className="mt-2 text-sm font-medium text-[var(--color-error)]" role="alert">
                {speakerTestError}
              </p>
            ) : null}
          </div>

          {deviceCheckWarning ? (
            <AlertBanner className="mt-5" title={t('deviceCheckPage.t15')} variant="warning">
              {deviceCheckWarning}
            </AlertBanner>
          ) : null}

          {queueError ? (
            <AlertBanner className="mt-5" title={t('deviceCheckPage.t16')} variant="error">
              {queueError}
            </AlertBanner>
          ) : null}

          <div className="mt-6 border-t border-[var(--color-divider)] pt-5">
            {meetingClosed ? (
              <AlertBanner className="mb-4" title={t('deviceCheckPage.ended.title')} variant="warning">
                {t('deviceCheckPage.ended.message')}
              </AlertBanner>
            ) : null}
            <button
              className={`mj-font-emphasis min-h-14 w-full rounded-[10px] border text-[17px] transition-colors ${
                !allReady || isEnteringQueue || meetingClosed
                  ? 'cursor-not-allowed border-[var(--color-border-control)] bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]'
                  : 'border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] text-white shadow-[var(--shadow-final-cta)] hover:bg-[var(--color-primary-coral-hover)]'
              }`}
              disabled={!allReady || isEnteringQueue || meetingClosed}
              onClick={() => void handleEnterQueue()}
              type="button"
            >
              {isEnteringQueue ? t('deviceCheckPage.t61') : t('deviceCheckPage.t62')}
            </button>
            <p
              aria-live="polite"
              className="mt-[11px] text-sm font-medium leading-[1.6] text-[var(--color-text-muted)]"
            >
              {meetingClosed
                ? t('deviceCheckPage.ended.message')
                : allReady
                  ? t('deviceCheckPage.t63')
                  : t('deviceCheckPage.t77', { p0: missingItems.join(', ') })}
            </p>
            {!isReady ? (
              <Button
                className="mt-2 w-full"
                loading={isRequesting}
                onClick={() => void start()}
                variant="ghost"
              >
                {status === 'idle' ? t('deviceCheckPage.t64') : t('deviceCheckPage.t65')}
              </Button>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  )
}
