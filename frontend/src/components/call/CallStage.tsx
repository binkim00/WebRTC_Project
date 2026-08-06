import type { ReactNode } from 'react'
import { cn } from '../ui/cn'
import { useTranslation } from '../../i18n'

/** 화자 이름이 붙은 자막 한 줄이다. */
export type CaptionLine = {
  speaker: string
  /** 화자가 말한 원문이며 항상 표시한다. */
  text: string
  /** 번역문이 있을 때만 원문 아래에 덧붙이는 보조 줄이다. */
  translatedText?: string
  /** 줄을 구분할 안정적인 식별자다. 같은 문장이 반복돼도 React key가 겹치지 않게 한다. */
  id?: string
}

/** 영상 위를 덮는 연결 상태 안내다. connecting·disconnected에서만 연결 리듬을 보여 준다. */
export type CallStageOverlay = {
  title: string
  description: string
  showLink: boolean
  /** 연결 종료처럼 사용자가 직접 복구해야 하는 상태의 행동 버튼이다. */
  actionLabel?: string
  onAction?: () => void
}

/** 통화를 유지한 채 상단에 띄우는 장치 이상 배너다. (device-error 상태) */
export type CallStageDeviceAlert = {
  title: string
  description: string
  actionLabel: string
  onAction: () => void
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
  /** 종료가 임박하면 타이머를 경고색으로 바꾼다. */
  timeUrgent?: boolean
  cameraEnabled: boolean
  microphoneEnabled: boolean
  captionEnabled: boolean
  /** 오래된 순서로 정렬된 최근 자막이며 마지막 줄이 현재 발화다. */
  captionLines?: readonly CaptionLine[]
  mediaAction?: 'camera' | 'microphone'
  overlay?: CallStageOverlay
  deviceAlert?: CallStageDeviceAlert
  onCameraToggle: () => void
  onMicrophoneToggle: () => void
  onCaptionToggle: () => void
  onLeave: () => void
  /** 기념 사진 셔터다. 넘기지 않으면 셔터 버튼을 숨긴다(팬 화면에서만 쓴다). */
  onCapture?: () => void
  /** 셔터 버튼에 표시할 문구다. 찍은 장수를 함께 보여 준다. */
  captureLabel?: string
  /** 저장 중이거나 장수를 다 채워 셔터를 누를 수 없는 상태인지 */
  captureDisabled?: boolean
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
  localParticipantLabel,
  connectionLabel,
  connected,
  timeLabel,
  timeValue,
  timeUrgent,
  cameraEnabled,
  microphoneEnabled,
  captionEnabled,
  captionLines,
  mediaAction,
  overlay,
  deviceAlert,
  onCameraToggle,
  onMicrophoneToggle,
  onCaptionToggle,
  onLeave,
  onCapture,
  captureLabel,
  captureDisabled,
}: CallStageProps) {
  const { t } = useTranslation()
  // 파라미터 기본값은 훅보다 먼저 평가되므로 기본 문구는 본문에서 정한다.
  const localParticipantLabelResolved = localParticipantLabel ?? t('callStage.t8')
  const deviceButtonClass =
    'min-h-9 whitespace-nowrap rounded-md px-1.5 text-[13px] font-bold transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60'

  return (
    <section
      aria-label={t('callStage.t1')}
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
            <strong
              className={cn(
                'text-2xl font-black leading-none tracking-[-0.035em] tabular-nums',
                timeUrgent ? 'text-[var(--color-warning-on-dark)]' : 'text-white',
              )}
            >
              {timeValue}
            </strong>
          </p>
          <p className="flex items-center gap-3 whitespace-nowrap">
            <button
              aria-label={t('callStage.t19', { p0: microphoneEnabled ? t('callStage.t9') : t('callStage.t10') })}
              className={cn(
                deviceButtonClass,
                microphoneEnabled ? 'text-white/75' : 'text-[var(--color-error-on-dark)]',
              )}
              disabled={mediaAction === 'microphone'}
              onClick={onMicrophoneToggle}
              type="button"
            >
              {t('callStage.t2')} {microphoneEnabled ? t('callStage.t11') : t('callStage.t12')}
            </button>
            <button
              aria-label={t('callStage.t20', { p0: cameraEnabled ? t('callStage.t13') : t('callStage.t14') })}
              className={cn(
                deviceButtonClass,
                cameraEnabled ? 'text-white/75' : 'text-[var(--color-error-on-dark)]',
              )}
              disabled={mediaAction === 'camera'}
              onClick={onCameraToggle}
              type="button"
            >
              {t('callStage.t3')} {cameraEnabled ? t('callStage.t15') : t('callStage.t16')}
            </button>
            {/* 기념 사진 셔터 — 통화가 끝난 뒤 완료 화면에서 카드로 만들 사진을 남긴다. */}
            {onCapture ? (
              <button
                aria-label="기념 사진 찍기"
                className={cn(deviceButtonClass, 'text-white/75')}
                disabled={captureDisabled}
                onClick={onCapture}
                type="button"
              >
                {captureLabel ?? '사진'}
              </button>
            ) : null}
            <button
              className="min-h-9 whitespace-nowrap rounded-md px-1.5 text-[13px] font-bold text-[var(--color-error-on-dark)] transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              onClick={onLeave}
              type="button"
            >
              {t('callStage.t4')}
            </button>
          </p>
        </div>
      </div>

      {/* 장치 이상 배너 — 통화를 가리지 않고 상단에 원인과 복구 행동을 띄운다. */}
      {deviceAlert ? (
        <div
          className="absolute inset-x-[17px] top-[74px] z-20 flex flex-wrap items-center justify-between gap-4 rounded-lg bg-[var(--color-warning)]/95 px-[15px] py-[13px]"
          role="alert"
        >
          <div className="min-w-0">
            <strong className="block text-base font-extrabold text-white">
              {deviceAlert.title}
            </strong>
            <span className="mt-1 block text-[15px] font-medium text-white/90">
              {deviceAlert.description}
            </span>
          </div>
          <button
            className="mj-font-label min-h-11 flex-none rounded-lg border border-white/40 px-4 text-[15px] text-white transition-colors hover:bg-white/10"
            onClick={deviceAlert.onAction}
            type="button"
          >
            {deviceAlert.actionLabel}
          </button>
        </div>
      ) : null}

      {/* 내 화면 PIP */}
      <figure
        aria-label={t('callStage.t21', { p0: localParticipantLabelResolved })}
        className="absolute bottom-[74px] right-[18px] z-10 m-0 w-[clamp(140px,17%,216px)] overflow-hidden rounded-lg bg-[var(--color-surface-dark-media)] shadow-[0_6px_24px_rgb(0_0_0/42%)]"
      >
        <div className="relative aspect-[4/3] w-full">{localVideo}</div>
        <figcaption className="absolute bottom-2 left-2 flex items-center gap-[7px] rounded-[5px] bg-[rgb(15_17_21/82%)] px-[9px] py-[5px]">
          <span className="text-xs font-extrabold text-white">{localParticipantLabelResolved}</span>
          <span className="text-xs font-bold text-[var(--color-success-on-dark)]">{t('callStage.t5')}</span>
        </figcaption>
      </figure>

      {/*
        실시간 자막 — 켜져 있을 때만 중앙 하단에 표시한다.
        상대가 말한 **가장 최근 한 문장**만 온다(subtitleChannel이 내 발화를 걸러내고 1줄만 남긴다).
        그래도 map으로 그리는 이유는 유지 줄 수를 늘리고 싶을 때 이 컴포넌트를 고치지 않아도 되게 하려는 것이다.
      */}
      {captionEnabled && captionLines?.length ? (
        <div
          aria-live="polite"
          className="absolute bottom-[18px] left-1/2 z-10 max-w-[min(70%,620px)] -translate-x-1/2 rounded-lg bg-[rgb(15_17_21/84%)] px-4 py-[11px] text-center"
        >
          {captionLines.map((line, index) => (
            <p
              className={index ? 'mt-1.5' : ''}
              // 자막 식별자를 우선 쓴다. 발화 내용으로만 식별하면 같은 말("네")이 반복될 때
              // key가 겹쳐 React가 다른 줄로 인식하지 못한다.
              key={line.id ?? `${line.speaker}:${line.text}`}
            >
              <strong className="text-sm font-extrabold text-white/75">{line.speaker}</strong>
              <span className="mt-[3px] block text-lg font-semibold leading-[1.45] text-white">
                {line.text}
              </span>
              {/* 번역문은 원문을 대체하지 않고 아래에 덧붙인다. 원문과 구분되게 한 단계 흐리게 둔다. */}
              {line.translatedText ? (
                <span className="mt-[3px] block text-base font-semibold leading-[1.45] text-white/80">
                  {line.translatedText}
                </span>
              ) : null}
            </p>
          ))}
        </div>
      ) : null}

      {/* 자막 토글 */}
      <div className="absolute bottom-[18px] left-[18px] z-10 flex items-center gap-2.5 rounded-lg bg-[rgb(15_17_21/78%)] px-3 py-2">
        <span className="text-sm font-bold text-white/90">{t('callStage.t6')}</span>
        <button
          aria-checked={captionEnabled}
          aria-label={t('callStage.t22', { p0: captionEnabled ? t('callStage.t17') : t('callStage.t18') })}
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
                aria-label={t('callStage.t7')}
                className="relative mx-auto mt-[22px] h-4 w-[220px]"
                role="img"
              >
                <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-sm bg-white/15" />
                <i className="absolute left-0 top-1/2 size-3 -translate-y-1/2 rounded-full bg-[var(--color-primary-coral-highlight)] motion-safe:animate-[mj-packet-left_2200ms_cubic-bezier(0.35,0,0.2,1)_both]" />
                <i className="absolute right-0 top-1/2 size-3 -translate-y-1/2 rounded-full bg-[var(--color-focus-indigo)] motion-safe:animate-[mj-packet-right_2200ms_cubic-bezier(0.35,0,0.2,1)_both]" />
                <i className="absolute left-1/2 top-1/2 size-[15px] rounded-full bg-[color-mix(in_srgb,var(--color-primary-coral-highlight)_50%,var(--color-focus-indigo))] opacity-0 motion-safe:animate-[mj-core-rhythm_2200ms_both] motion-reduce:-translate-x-1/2 motion-reduce:-translate-y-1/2 motion-reduce:opacity-100" />
              </div>
            ) : null}
            {overlay.actionLabel && overlay.onAction ? (
              <button
                className="mj-font-emphasis mt-5 min-h-[52px] rounded-[10px] border border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] px-[26px] text-base text-white transition-colors hover:bg-[var(--color-primary-coral-hover)]"
                onClick={overlay.onAction}
                type="button"
              >
                {overlay.actionLabel}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <span className="sr-only">{participantLabel}</span>
    </section>
  )
}
