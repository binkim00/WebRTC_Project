import type { ReactNode } from 'react'
import { cn } from '../ui/cn'

/** 화자 이름이 붙은 자막 한 줄이다. */
export type CaptionLine = {
  speaker: string
  text: string
}

/** 영상 위를 덮는 연결 상태 안내다. connecting·disconnected에서만 연결 리듬을 보여 준다. */
export type CallStageOverlay = {
  title: string
  description: string
  showLink: boolean
}

export type CallStageProps = {
  remoteVideo: ReactNode
  localVideo: ReactNode
  participantLabel: string
  /** 상단 바에 표시할 상대(원격 참가자) 이름이다. */
  remoteName: string
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
  overlay?: CallStageOverlay
  onCameraToggle: () => void
  onMicrophoneToggle: () => void
  onCaptionToggle: () => void
  onLeave: () => void
}

/**
 * 영상통화 다크 콘솔 셸이다. (Fan Call.dc.html — 표현 강도 1, 코랄 0회)
 *
 * 팬·인플루언서 통화가 같은 셸을 쓰며, 실시간 로직은 ConnectedCallRoom이 소유한다.
 */
export function CallStage({
  remoteVideo,
  localVideo,
  participantLabel,
  remoteName,
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
  overlay,
  onCameraToggle,
  onMicrophoneToggle,
  onCaptionToggle,
  onLeave,
}: CallStageProps) {
  const deviceButtonClass =
    'min-h-9 whitespace-nowrap rounded-md px-1.5 text-[13px] font-bold transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60'

  return (
    <section
      aria-label="영상통화 화면"
      className="relative overflow-hidden rounded-xl bg-[var(--color-surface-dark-media)] max-lg:min-h-[520px] lg:aspect-video"
    >
      <div className="absolute inset-0">{remoteVideo}</div>

      {/* 상단 정보 바 — 이미지 위 그라데이션에 얹힌다. */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4 bg-gradient-to-b from-[rgb(15_17_21/72%)] to-transparent px-[18px] py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <strong className="truncate text-[17px] font-extrabold tracking-[-0.02em] text-white">
            {remoteName}
          </strong>
          <span
            className={cn(
              'whitespace-nowrap text-[13px] font-bold',
              connected ? 'text-[var(--color-success-on-dark)]' : 'text-[var(--color-warning-on-dark)]',
            )}
          >
            {connectionLabel}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
          <p className="flex items-baseline gap-2">
            <span className="whitespace-nowrap text-[13px] font-semibold text-white/75">
              {timeLabel}
            </span>
            <strong className="text-2xl font-black leading-none tracking-[-0.035em] text-white tabular-nums">
              {timeValue}
            </strong>
          </p>
          <p className="flex items-center gap-3 whitespace-nowrap">
            <button
              aria-label={`마이크 ${microphoneEnabled ? '끄기' : '켜기'}`}
              className={cn(
                deviceButtonClass,
                microphoneEnabled ? 'text-white/75' : 'text-[var(--color-error-on-dark)]',
              )}
              disabled={mediaAction === 'microphone'}
              onClick={onMicrophoneToggle}
              type="button"
            >
              마이크 {microphoneEnabled ? '정상' : '꺼짐'}
            </button>
            <button
              aria-label={`카메라 ${cameraEnabled ? '끄기' : '켜기'}`}
              className={cn(
                deviceButtonClass,
                cameraEnabled ? 'text-white/75' : 'text-[var(--color-error-on-dark)]',
              )}
              disabled={mediaAction === 'camera'}
              onClick={onCameraToggle}
              type="button"
            >
              카메라 {cameraEnabled ? '정상' : '꺼짐'}
            </button>
            <button
              className="min-h-9 whitespace-nowrap rounded-md px-1.5 text-[13px] font-bold text-[var(--color-error-on-dark)] transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              onClick={onLeave}
              type="button"
            >
              통화 종료
            </button>
          </p>
        </div>
      </div>

      {/* 내 화면 PIP */}
      <figure
        aria-label={`${localParticipantLabel} 영상`}
        className="absolute bottom-[74px] right-[18px] z-10 m-0 w-[clamp(140px,17%,216px)] overflow-hidden rounded-lg bg-[var(--color-surface-dark-media)] shadow-[0_6px_24px_rgb(0_0_0/42%)]"
      >
        <div className="relative aspect-[4/3] w-full">{localVideo}</div>
        <figcaption className="absolute bottom-2 left-2 flex items-center gap-[7px] rounded-[5px] bg-[rgb(15_17_21/82%)] px-[9px] py-[5px]">
          <span className="text-xs font-extrabold text-white">{localParticipantLabel}</span>
          <span className="text-xs font-bold text-[var(--color-success-on-dark)]">연결됨</span>
        </figcaption>
      </figure>

      {/* 실시간 자막 — 켜져 있을 때만 중앙 하단에 표시한다. */}
      {captionEnabled && captionLines?.length ? (
        <div
          aria-live="polite"
          className="absolute bottom-[18px] left-1/2 z-10 max-w-[min(70%,620px)] -translate-x-1/2 rounded-lg bg-[rgb(15_17_21/84%)] px-4 py-[11px] text-center"
        >
          {captionLines.map((line, index) => (
            <p
              className={index ? 'mt-1.5' : ''}
              // 자막은 갱신되며 내용이 바뀌므로 배열 순서가 아니라 발화 내용으로 식별한다.
              key={`${line.speaker}:${line.text}`}
            >
              <strong className="text-sm font-extrabold text-white/75">{line.speaker}</strong>
              <span
                className={cn(
                  'mt-[3px] block text-lg font-semibold leading-[1.45]',
                  // 지나간 대사는 흐리게 남겨 현재 발화가 어느 줄인지 위치와 명도로 함께 구분한다.
                  index === captionLines.length - 1 ? 'text-white' : 'text-white/55',
                )}
              >
                {line.text}
              </span>
            </p>
          ))}
        </div>
      ) : null}

      {/* 자막 토글 */}
      <div className="absolute bottom-[18px] left-[18px] z-10 flex items-center gap-2.5 rounded-lg bg-[rgb(15_17_21/78%)] px-3 py-2">
        <span className="text-sm font-bold text-white/90">자막</span>
        <button
          aria-checked={captionEnabled}
          aria-label={`자막 ${captionEnabled ? '끄기' : '켜기'}`}
          className={cn(
            'relative h-[26px] w-[46px] rounded-full border p-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
            captionEnabled ? 'border-white/90 bg-white/90' : 'border-white/40 bg-transparent',
          )}
          onClick={onCaptionToggle}
          role="switch"
          type="button"
        >
          <span
            className={cn(
              'absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] duration-[180ms] motion-reduce:transition-none',
              captionEnabled ? 'left-[23px] bg-[var(--color-surface-dark)]' : 'left-0.5',
            )}
          />
        </button>
      </div>

      {/* 연결 상태 오버레이 — connecting·disconnected·device-error */}
      {overlay ? (
        <div
          className="absolute inset-0 z-30 grid place-items-center bg-[rgb(15_17_21/78%)] p-6"
          role="status"
        >
          <div className="max-w-[420px] text-center">
            <h2 className="text-[26px] font-black tracking-[-0.035em] text-white">
              {overlay.title}
            </h2>
            <p className="mt-3 text-[17px] font-medium leading-[1.6] text-white/85">
              {overlay.description}
            </p>
            {overlay.showLink ? (
              <div
                aria-label="연결을 준비하고 있습니다"
                className="relative mx-auto mt-[22px] h-4 w-[220px]"
                role="img"
              >
                <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-sm bg-white/15" />
                <i className="absolute left-0 top-1/2 size-3 -translate-y-1/2 rounded-full bg-[var(--color-primary-coral-highlight)] motion-safe:animate-[mj-packet-left_2200ms_cubic-bezier(0.35,0,0.2,1)_both]" />
                <i className="absolute right-0 top-1/2 size-3 -translate-y-1/2 rounded-full bg-[var(--color-focus-indigo)] motion-safe:animate-[mj-packet-right_2200ms_cubic-bezier(0.35,0,0.2,1)_both]" />
                <i className="absolute left-1/2 top-1/2 size-[15px] rounded-full bg-[color-mix(in_srgb,var(--color-primary-coral-highlight)_50%,var(--color-focus-indigo))] opacity-0 motion-safe:animate-[mj-core-rhythm_2200ms_both] motion-reduce:-translate-x-1/2 motion-reduce:-translate-y-1/2 motion-reduce:opacity-100" />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <span className="sr-only">{participantLabel}</span>
    </section>
  )
}
