import {
  CheckCircleIcon,
  ClockIcon,
  ClosedCaptioningIcon,
  MicrophoneIcon,
  MicrophoneSlashIcon,
  PhoneDisconnectIcon,
  VideoCameraIcon,
  VideoCameraSlashIcon,
  WifiHighIcon,
} from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { cn } from '../ui/cn'

/** 화자 이름이 붙은 자막 한 줄이다. */
export type CaptionLine = {
  speaker: string
  text: string
}

export type CallStageProps = {
  remoteVideo: ReactNode
  localVideo: ReactNode
  participantLabel: string
  localParticipantLabel?: string
  connectionLabel: string
  connected: boolean
  timeLabel: string
  timeValue: string
  cameraEnabled: boolean
  microphoneEnabled: boolean
  captionEnabled: boolean
  /** 오래된 순서로 정렬된 최근 자막이며 마지막 줄이 현재 발화다. */
  captionLines?: readonly CaptionLine[]
  mediaAction?: 'camera' | 'microphone'
  onCameraToggle: () => void
  onMicrophoneToggle: () => void
  onCaptionToggle: () => void
  onLeave: () => void
}

type DeviceStatusButtonProps = {
  enabled: boolean
  loading?: boolean
  label: string
  enabledIcon: ReactNode
  disabledIcon: ReactNode
  onClick: () => void
}

function DeviceStatusButton({
  enabled,
  loading,
  label,
  enabledIcon,
  disabledIcon,
  onClick,
}: DeviceStatusButtonProps) {
  return (
    <button
      aria-label={`${label} ${enabled ? '끄기' : '켜기'}`}
      className={cn(
        'inline-flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-sm font-semibold transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
        enabled
          ? 'text-[#daf5df] hover:bg-white/10'
          : 'bg-white/10 text-[#ffcbc8] hover:bg-white/15',
      )}
      disabled={loading}
      onClick={onClick}
      type="button"
    >
      <span aria-hidden="true" className={cn(loading && 'animate-pulse')}>
        {enabled ? enabledIcon : disabledIcon}
      </span>
      <span className="hidden xl:inline">{label} {enabled ? '정상' : '꺼짐'}</span>
    </button>
  )
}

export function CallStage({
  remoteVideo,
  localVideo,
  participantLabel,
  localParticipantLabel = '나',
  connectionLabel,
  connected,
  timeLabel,
  timeValue,
  cameraEnabled,
  microphoneEnabled,
  captionEnabled,
  captionLines,
  mediaAction,
  onCameraToggle,
  onMicrophoneToggle,
  onCaptionToggle,
  onLeave,
}: CallStageProps) {
  return (
    <section
      aria-label="영상통화 화면"
      className="mx-auto w-full max-w-[1312px] rounded-[18px] bg-[#46433e] p-3 shadow-[var(--shadow-media)] sm:p-5"
    >
      <div className="relative min-h-[560px] overflow-hidden rounded-xl bg-[#17181d] sm:min-h-[520px] lg:aspect-[1.585] lg:min-h-0">
        <div className="absolute inset-0">{remoteVideo}</div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/30" />

        <div className="absolute inset-x-3 top-3 z-20 grid min-h-16 grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl bg-[rgb(25_24_29/88%)] px-3 py-2 text-white backdrop-blur-md sm:inset-x-5 sm:top-5 sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden text-lg font-black tracking-[-0.04em] sm:inline">Melly</span>
            <span
              className={cn(
                'inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold',
                connected
                  ? 'border-[#4b7253] bg-[#2e4834] text-[#d9f5df]'
                  : 'border-white/15 bg-white/10 text-white/75',
              )}
            >
              <WifiHighIcon aria-hidden="true" size={17} weight="bold" />
              {connectionLabel}
            </span>
          </div>

          <div className="flex items-center justify-center gap-2 whitespace-nowrap">
            <ClockIcon aria-hidden="true" className="text-white/85" size={21} weight="bold" />
            <span className="hidden text-sm font-medium text-white/65 sm:inline">{timeLabel}</span>
            <strong className="text-lg tracking-[-0.02em] sm:text-2xl">{timeValue}</strong>
          </div>

          <div className="flex items-center justify-end gap-1">
            <DeviceStatusButton
              disabledIcon={<MicrophoneSlashIcon size={20} weight="bold" />}
              enabled={microphoneEnabled}
              enabledIcon={<MicrophoneIcon size={20} weight="bold" />}
              label="마이크"
              loading={mediaAction === 'microphone'}
              onClick={onMicrophoneToggle}
            />
            <DeviceStatusButton
              disabledIcon={<VideoCameraSlashIcon size={20} weight="bold" />}
              enabled={cameraEnabled}
              enabledIcon={<VideoCameraIcon size={20} weight="bold" />}
              label="카메라"
              loading={mediaAction === 'camera'}
              onClick={onCameraToggle}
            />
            <button
              aria-label="영상통화 종료"
              className="ml-1 inline-flex size-10 items-center justify-center rounded-full bg-[#d4403d] text-white transition hover:bg-[#c93634] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              onClick={onLeave}
              type="button"
            >
              <PhoneDisconnectIcon aria-hidden="true" size={20} weight="fill" />
            </button>
          </div>
        </div>

        <aside
          aria-label={`${localParticipantLabel} 영상`}
          className="absolute right-4 top-24 z-10 aspect-[4/3] w-[clamp(150px,22vw,270px)] overflow-hidden rounded-xl border border-white/20 bg-[#23242a] shadow-[0_18px_45px_rgb(0_0_0/28%)] sm:right-6 sm:top-28"
        >
          <div className="absolute inset-0">{localVideo}</div>
          <div className="absolute inset-x-0 bottom-0 flex min-h-10 items-center justify-between gap-2 bg-[rgb(38_24_27/82%)] px-3 text-sm font-bold text-white backdrop-blur-sm">
            <span>{localParticipantLabel}</span>
            <span className="inline-flex items-center gap-1 text-xs text-[#d9f5df]">
              <CheckCircleIcon aria-hidden="true" size={16} weight="fill" />
              연결됨
            </span>
          </div>
        </aside>

        <div className="absolute inset-x-4 bottom-4 z-20 flex items-end gap-3 sm:inset-x-6 sm:bottom-6">
          <button
            aria-checked={captionEnabled}
            aria-label={`자막 ${captionEnabled ? '끄기' : '켜기'}`}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-[rgb(28_26_30/88%)] px-3 text-sm font-bold text-white shadow-lg backdrop-blur-md transition hover:bg-[rgb(28_26_30/96%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            onClick={onCaptionToggle}
            role="switch"
            type="button"
          >
            <ClosedCaptioningIcon aria-hidden="true" size={21} weight="bold" />
            <span className="hidden sm:inline">자막</span>
            <span
              aria-hidden="true"
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors',
                captionEnabled ? 'bg-[#d4403d]' : 'bg-white/25',
              )}
            >
              <span
                className={cn(
                  'absolute left-1 top-1 size-4 rounded-full bg-white shadow transition-transform duration-200',
                  captionEnabled ? 'translate-x-5' : 'translate-x-0',
                )}
              />
            </span>
          </button>

          <div
            aria-live="polite"
            className={cn(
              'grid min-h-12 min-w-0 max-w-[840px] flex-1 gap-1 rounded-xl bg-[rgb(34_27_30/86%)] px-4 py-3 text-center text-sm text-white shadow-lg backdrop-blur-md sm:text-base',
              !captionEnabled && 'invisible',
            )}
          >
            {captionLines?.length ? (
              captionLines.map((line, index) => (
                <p
                  className={cn(
                    // 지나간 대사는 흐리게 남겨 현재 발화가 어느 줄인지 위치와 명도로 함께 구분한다.
                    index === captionLines.length - 1 ? 'text-white' : 'text-white/55',
                  )}
                  // 자막은 갱신되며 내용이 바뀌므로 배열 순서가 아니라 발화 내용으로 식별한다.
                  key={`${line.speaker}:${line.text}`}
                >
                  <strong className="mr-2 text-[#ffd6d2]">{line.speaker}</strong>
                  <span>{line.text}</span>
                </p>
              ))
            ) : (
              <p>자막 데이터 연결을 기다리고 있습니다.</p>
            )}
          </div>
        </div>

        <span className="sr-only">{participantLabel}</span>
      </div>
    </section>
  )
}
