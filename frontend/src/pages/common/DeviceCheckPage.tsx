import {
  ArrowRightIcon,
  CameraIcon,
  CheckCircleIcon,
  CheckIcon,
  MicrophoneIcon,
  SpeakerHighIcon,
  WifiHighIcon,
} from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import previewCameraImage from '../../assets/call-preview-remote.jpg'
import {
  AlertBanner,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  MediaDevicePreview,
  Select,
} from '../../components'
import type { FeedbackVariant } from '../../components'
import { InvalidRouteState } from '../../components/routing/ScreenPage'
import {
  useMediaDeviceCheck,
  type MediaCheckStatus,
} from '../../hooks/useMediaDeviceCheck'

const statusContent: Record<
  MediaCheckStatus,
  { title: string; message: string; variant: FeedbackVariant }
> = {
  idle: {
    title: '장비 사용 전 안내',
    message: '아래 버튼을 누르면 브라우저가 카메라와 마이크 사용 권한을 요청합니다.',
    variant: 'info',
  },
  requesting: {
    title: '권한 확인 중',
    message: '브라우저의 권한 요청 창에서 카메라와 마이크 사용을 허용해 주세요.',
    variant: 'warning',
  },
  ready: {
    title: '장비 준비 완료',
    message: '카메라 미리보기와 선택한 마이크가 정상적으로 연결되었습니다.',
    variant: 'success',
  },
  denied: {
    title: '장비 권한이 필요합니다',
    message: '',
    variant: 'error',
  },
  'no-device': {
    title: '장치를 찾을 수 없습니다',
    message: '',
    variant: 'error',
  },
  unsupported: {
    title: '지원하지 않는 환경입니다',
    message: '',
    variant: 'error',
  },
  error: {
    title: '장비를 시작하지 못했습니다',
    message: '',
    variant: 'error',
  },
}

type SinkSelectableAudioElement = HTMLAudioElement & {
  setSinkId: (sinkId: string) => Promise<void>
}

function createDeviceOptions(devices: readonly MediaDeviceInfo[], fallbackLabel: string) {
  return devices.map((device, index) => ({
    label: device.label || `${fallbackLabel} ${index + 1}`,
    value: device.deviceId,
  }))
}

export function DeviceCheckPage() {
  const { fanMeetingId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isVisualPreview = import.meta.env.DEV && searchParams.get('preview') === '1'
  const [isPlayingTestSound, setIsPlayingTestSound] = useState(false)
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
    if (!isVisualPreview) {
      void start()
    }
  }, [isVisualPreview, start])

  if (!fanMeetingId?.trim()) {
    return (
      <InvalidRouteState
        message="URL에 필요한 fanMeetingId 값이 없습니다. 이전 화면에서 올바른 팬미팅을 선택해 주세요."
        title="필수 URL 파라미터가 없습니다"
      />
    )
  }

  const currentStatus = isVisualPreview ? statusContent.ready : statusContent[status]
  const isRequesting = status === 'requesting'
  const isReady = status === 'ready' || isVisualPreview
  const cameraOptions =
    cameras.length > 0
      ? createDeviceOptions(cameras, '카메라')
      : isVisualPreview
        ? [{ label: 'FaceTime HD Camera', value: 'preview-camera' }]
        : []
  const microphoneOptions =
    microphones.length > 0
      ? createDeviceOptions(microphones, '마이크')
      : isVisualPreview
        ? [{ label: 'MacBook Pro 마이크', value: 'preview-microphone' }]
        : []
  const speakerOptions =
    speakers.length > 0
      ? createDeviceOptions(speakers, '스피커')
      : [
          {
            label: isVisualPreview ? 'MacBook Pro 스피커' : '시스템 기본 스피커',
            value: 'default',
          },
        ]
  const videoTrackReady =
    isVisualPreview || stream?.getVideoTracks().some((track) => track.readyState === 'live')
  const audioTrackReady =
    isVisualPreview || stream?.getAudioTracks().some((track) => track.readyState === 'live')
  const displayedAudioLevel = isVisualPreview ? 0.64 : audioLevel
  const networkReady = navigator.onLine
  const allReady = Boolean(videoTrackReady && audioTrackReady && networkReady)

  async function playTestSound() {
    if (isPlayingTestSound) return

    setIsPlayingTestSound(true)

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
    } catch (error) {
      console.warn('스피커 테스트를 재생하지 못했습니다.', error)
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

  return (
    <div className="grid gap-8">
      <header className="max-w-3xl">
        <p className="text-sm font-bold text-[var(--color-text-secondary)]">팬미팅 입장 전</p>
        <h1 className="mt-2 text-4xl font-black tracking-[-0.035em] text-[var(--color-text-primary)] sm:text-[42px]">
          장비를 점검해 주세요
        </h1>
        <p className="mt-3 text-base text-[var(--color-text-secondary)]">
          카메라 화면과 오디오 장비를 확인한 뒤 팬미팅에 입장해 주세요.
        </p>
      </header>

      <div className="grid items-start gap-9 lg:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.92fr)]">
        <div className="grid gap-5">
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between px-5 py-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <CameraIcon aria-hidden="true" size={20} weight="fill" />
                카메라 미리보기
              </CardTitle>
              <span
                className={
                  videoTrackReady
                    ? 'inline-flex items-center gap-1 text-sm font-bold text-[var(--color-success)]'
                    : 'text-sm font-semibold text-[var(--color-text-secondary)]'
                }
              >
                {videoTrackReady ? <CheckIcon aria-hidden="true" size={16} weight="bold" /> : null}
                {videoTrackReady ? '연결 완료' : '연결 대기'}
              </span>
            </CardHeader>
            <CardContent className="p-0">
              <MediaDevicePreview
                className="rounded-none shadow-none"
                previewImage={isVisualPreview ? previewCameraImage : undefined}
                stream={stream}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3 border-b border-[var(--color-divider)] pb-4">
                <CheckCircleIcon
                  aria-hidden="true"
                  className={allReady ? 'text-[var(--color-success)]' : 'text-[var(--color-text-tertiary)]'}
                  size={28}
                  weight="fill"
                />
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="font-bold text-[var(--color-text-primary)]">
                    {allReady ? '입장 준비가 완료됐어요' : '장비 연결을 확인하고 있어요'}
                  </h2>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    {allReady
                      ? '모든 장비와 네트워크가 정상적으로 연결되었습니다.'
                      : currentStatus.message}
                  </p>
                </div>
              </div>
              <div className="grid gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: '카메라',
                    description: videoTrackReady ? '화면이 선명해요' : '확인이 필요해요',
                    ready: Boolean(videoTrackReady),
                    icon: <CameraIcon aria-hidden="true" size={19} />,
                  },
                  {
                    label: '마이크',
                    description: audioTrackReady ? '목소리가 잘 들려요' : '확인이 필요해요',
                    ready: Boolean(audioTrackReady),
                    icon: <MicrophoneIcon aria-hidden="true" size={19} />,
                  },
                  {
                    label: '스피커',
                    description: '테스트할 수 있어요',
                    ready: speakerOptions.length > 0,
                    icon: <SpeakerHighIcon aria-hidden="true" size={19} />,
                  },
                  {
                    label: '네트워크',
                    description: networkReady ? '연결이 안정적이에요' : '연결이 끊겼어요',
                    ready: networkReady,
                    icon: <WifiHighIcon aria-hidden="true" size={19} />,
                  },
                ].map((item) => (
                  <div className="flex items-start gap-3" key={item.label}>
                    <span className="mt-0.5 text-[var(--color-text-secondary)]">{item.icon}</span>
                    <span className="min-w-0 flex-1">
                      <strong className="block text-sm">{item.label}</strong>
                      <span className="block truncate text-xs text-[var(--color-text-secondary)]">
                        {item.description}
                      </span>
                    </span>
                    {item.ready ? (
                      <CheckIcon
                        aria-hidden="true"
                        className="mt-0.5 shrink-0 text-[var(--color-success)]"
                        size={17}
                        weight="bold"
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="grid gap-5">
          <div className="flex items-end justify-between border-b border-[var(--color-divider)] pb-4">
            <div>
              <p className="text-xs font-black tracking-[0.12em] text-[var(--color-text-secondary)]">
                DEVICE SETTINGS
              </p>
              <h2 className="mt-2 text-2xl font-black">장비 설정</h2>
            </div>
            <span className="text-sm text-[var(--color-text-secondary)]">
              {allReady ? '모든 항목 정상' : '확인 중'}
            </span>
          </div>

          {!isReady ? (
            <AlertBanner title={currentStatus.title} variant={currentStatus.variant}>
              {errorMessage ?? currentStatus.message}
            </AlertBanner>
          ) : null}

          <section className="border-b border-[var(--color-divider)] pb-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-[var(--color-divider)]">
                  <WifiHighIcon aria-hidden="true" size={20} weight="bold" />
                </span>
                <span>
                  <strong className="block text-sm">네트워크</strong>
                  <span className="text-xs text-[var(--color-text-secondary)]">
                    팬미팅을 진행하기에 안정적인 연결이에요
                  </span>
                </span>
              </div>
              <span className="text-xs font-bold text-[var(--color-success)]">
                {networkReady ? '✓ 안정적' : '연결 끊김'}
              </span>
            </div>
          </section>

          <section className="border-b border-[var(--color-divider)] pb-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-[var(--color-divider)]">
                  <CameraIcon aria-hidden="true" size={20} weight="bold" />
                </span>
                <span>
                  <strong className="block text-sm">카메라</strong>
                  <span className="text-xs text-[var(--color-text-secondary)]">화면을 확인해 주세요</span>
                </span>
              </div>
              <span className="text-xs font-bold text-[var(--color-success)]">
                {videoTrackReady ? '✓ 연결됨' : '확인 필요'}
              </span>
            </div>
            <Select
              containerClassName="[&_label]:sr-only"
              disabled={!isReady || cameraOptions.length === 0}
              label="카메라 선택"
              onChange={(event) =>
                isVisualPreview ? undefined : void selectCamera(event.target.value)
              }
              options={cameraOptions}
              value={isVisualPreview ? 'preview-camera' : selectedCameraId}
            />
          </section>

          <section className="border-b border-[var(--color-divider)] pb-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-[var(--color-divider)]">
                  <MicrophoneIcon aria-hidden="true" size={20} weight="bold" />
                </span>
                <span>
                  <strong className="block text-sm">마이크</strong>
                  <span className="text-xs text-[var(--color-text-secondary)]">말하면서 입력을 확인해 주세요</span>
                </span>
              </div>
              <span className="text-xs font-bold text-[var(--color-success)]">
                {audioTrackReady ? '✓ 연결됨' : '확인 필요'}
              </span>
            </div>
            <Select
              containerClassName="[&_label]:sr-only"
              disabled={!isReady || microphoneOptions.length === 0}
              label="마이크 선택"
              onChange={(event) =>
                isVisualPreview ? undefined : void selectMicrophone(event.target.value)
              }
              options={microphoneOptions}
              value={isVisualPreview ? 'preview-microphone' : selectedMicrophoneId}
            />
            <div
              className="mt-3 flex items-center gap-3"
              aria-label={`마이크 입력 ${Math.round(displayedAudioLevel * 100)}%`}
            >
              <span className="text-xs text-[var(--color-text-secondary)]">입력 상태</span>
              <div className="flex flex-1 items-end gap-1" aria-hidden="true">
                {Array.from({ length: 16 }, (_, index) => (
                  <span
                    className={
                      index / 16 < displayedAudioLevel
                        ? 'h-2 flex-1 rounded-sm bg-[var(--color-primary-coral)]'
                        : 'h-1.5 flex-1 rounded-sm bg-[var(--color-divider)]'
                    }
                    key={index}
                  />
                ))}
              </div>
              <span className="text-xs font-bold text-[var(--color-success)]">
                {displayedAudioLevel > 0.55
                  ? '좋음'
                  : displayedAudioLevel > 0.15
                    ? '보통'
                    : '대기'}
              </span>
            </div>
          </section>

          <section className="border-b border-[var(--color-divider)] pb-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-[var(--color-divider)]">
                  <SpeakerHighIcon aria-hidden="true" size={20} weight="bold" />
                </span>
                <span>
                  <strong className="block text-sm">스피커</strong>
                  <span className="text-xs text-[var(--color-text-secondary)]">소리가 들리는지 테스트해 주세요</span>
                </span>
              </div>
              <span className="text-xs font-bold text-[var(--color-success)]">✓ 연결됨</span>
            </div>
            <Select
              containerClassName="[&_label]:sr-only"
              disabled={!isReady}
              label="스피커 선택"
              onChange={(event) => selectSpeaker(event.target.value)}
              options={speakerOptions}
              value={selectedSpeakerId || 'default'}
            />
            <Button
              className="mt-3 w-full"
              disabled={!isReady}
              loading={isPlayingTestSound}
              leadingIcon={<SpeakerHighIcon aria-hidden="true" size={19} />}
              onClick={() => void playTestSound()}
              variant="secondary"
            >
              테스트 음원 재생
            </Button>
          </section>

          <Button
            className="w-full shadow-[var(--shadow-final-cta)]"
            disabled={!allReady}
            onClick={() => navigate(`/fan/fan-meetings/${encodeURIComponent(fanMeetingId)}/waiting`)}
            size="lg"
            trailingIcon={<ArrowRightIcon aria-hidden="true" size={20} weight="bold" />}
          >
            팬미팅 입장하기
          </Button>
          <p className="-mt-2 text-center text-xs text-[var(--color-text-secondary)]">
            입장 후에도 팬미팅 화면에서 장비를 변경할 수 있어요.
          </p>
          {!isReady ? (
            <Button loading={isRequesting} onClick={() => void start()} variant="ghost">
              장비 다시 확인
            </Button>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
