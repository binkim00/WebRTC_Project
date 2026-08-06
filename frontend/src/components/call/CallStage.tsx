import {
  CameraIcon,
  ClosedCaptioningIcon,
  MicrophoneIcon,
  MicrophoneSlashIcon,
  PhoneDisconnectIcon,
  SmileyIcon,
  VideoCameraIcon,
  VideoCameraSlashIcon,
} from '@phosphor-icons/react'
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { cn } from '../ui/cn'
import { useTranslation } from '../../i18n'

/** 셀프뷰가 붙을 수 있는 모서리다. 자유 배치 대신 모서리에 붙여 자막·조작을 가리지 않게 한다. */
type PipCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

/** 모서리별 배치 클래스다. 위쪽은 이름 칩·조작 줄 아래로 내려 겹치지 않게 한다. */
const PIP_CORNER_CLASS: Record<PipCorner, string> = {
  'top-left': 'left-3.5 top-[52px]',
  'top-right': 'right-3.5 top-[52px]',
  'bottom-left': 'bottom-3.5 left-3.5',
  'bottom-right': 'bottom-3.5 right-3.5',
}

/** 두 번 눌러 순환하는 셀프뷰 크기 3단계다. */
const PIP_WIDTH_CLASSES = [
  'w-[clamp(96px,12%,150px)]',
  'w-[clamp(120px,15%,200px)]',
  'w-[clamp(150px,21%,280px)]',
] as const

/** 이 거리(px)보다 적게 움직이면 끌기가 아니라 누르기(더블클릭 크기 변경)로 본다. */
const PIP_DRAG_THRESHOLD = 6

/** 화자 이름이 붙은 자막 한 줄이다. */
export type CaptionLine = {
  speaker: string
  /** 화면에 표시할 문장이다. 시청자 언어의 번역문이 있으면 번역문, 없으면 원문이다. */
  text: string
  /** 본문 아래에 덧붙일 보조 줄이다. 지금은 채우지 않지만 표시 능력은 남겨 둔다. */
  translatedText?: string
  /** 아직 자라는 중인 부분 자막(interim)이면 true다. 확정 자막보다 옅게 표시한다. */
  pending?: boolean
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

/** 화면에 떠오르는 리액션 한 개다. 표시가 끝나면 목록에서 사라진다. */
export type FloatingReaction = {
  /** React key이며 같은 이모지를 연속으로 눌러도 겹치지 않게 한다. */
  id: string
  emoji: string
  /** 가로 위치(%)다. 여러 개가 한 줄에 겹치지 않도록 보낼 때 흩뿌린다. */
  leftPercent: number
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
  /** 좌상단에 표시할 상대(원격 참가자) 이름이다. */
  remoteName: string
  localParticipantLabel?: string
  connectionLabel: string
  connected: boolean
  timeLabel: string
  timeValue: string
  /**
   * 종료 임박 단계다. 10초 이하는 warning(주황), 5초 이하는 critical(빨강+떨림)로
   * 표시해 남은 시간이 줄어드는 것을 색으로도 알린다. 값이 없으면 평상시다.
   */
  timeUrgency?: 'warning' | 'critical'
  /**
   * 남은 시간의 비율(0~1)이며 화면 맨 위 헤어라인 게이지로 그린다.
   *
   * 숫자만 있으면 "얼마나 남았는지"가 감각으로 오지 않는다. 통화 화면을 가리면 안 되므로
   * 별도 영역 없이 상단 가장자리 3px만 쓴다. 값이 없으면 게이지를 숨긴다.
   */
  timeRatio?: number
  /** 보낼 수 있는 리액션 목록이며 비어 있으면 리액션 UI를 숨긴다. */
  reactionEmojis?: readonly string[]
  /** 화면에 떠오르는 중인 리액션들이다. */
  floatingReactions?: readonly FloatingReaction[]
  onReactionSend?: (emoji: string) => void
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
  /**
   * 촬영 카운트다운 숫자(3→2→1)다. 값이 있으면 화면 중앙에 크게 띄운다.
   *
   * 셔터를 누른 쪽뿐 아니라 신호를 받은 상대 화면에도 같은 값이 내려와, 양쪽이 함께
   * 포즈를 잡는다. 카운트가 끝나는 순간(값이 사라지는 순간) 찰칵 플래시가 터진다.
   */
  captureCountdown?: number
  /**
   * 방금 찍힌 사진의 미리보기다. 찰칵 직후 썸네일이 셔터 버튼 쪽으로 날아가 흡수되어
   * "찍혔고, 저기에 쌓인다"를 한 번에 알린다. id가 바뀔 때마다 연출이 다시 돈다.
   */
  captureFlight?: { url: string; id: number }
}

/**
 * 영상통화 다크 콘솔 셸이다. (Fan Call.dc.html — 표현 강도 1, 코랄 0회)
 *
 * 팬·인플루언서 통화가 같은 셸을 쓰며, 실시간 로직은 ConnectedCallRoom이 소유한다.
 *
 * 배치 원칙: 영상이 주인공이라 "바"를 만들지 않는다. 좌상단엔 상대 이름, 우상단엔
 * 타이머와 투명 아이콘 조작 줄 하나, 하단엔 자막과 셀프뷰만 남긴다.
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
  timeUrgency,
  timeRatio,
  reactionEmojis,
  floatingReactions,
  onReactionSend,
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
  captureCountdown,
  captureFlight,
}: CallStageProps) {
  const { t } = useTranslation()
  // 파라미터 기본값은 훅보다 먼저 평가되므로 기본 문구는 본문에서 정한다.
  const localParticipantLabelResolved = localParticipantLabel ?? t('callStage.t8')
  // 리액션은 상시 노출하지 않고 조작 줄의 이모지 버튼으로 여닫는다. 표시 상태는 이 셸만 안다.
  const [reactionsOpen, setReactionsOpen] = useState(false)
  // 찰칵 플래시를 켠 횟수다. 값이 바뀔 때마다 key가 갈려 애니메이션이 처음부터 다시 돈다.
  const [shutterFlashCount, setShutterFlashCount] = useState(0)

  /**
   * 셀프뷰 배치·크기 조작이다. 끌면 놓은 지점에서 가장 가까운 모서리에 붙고,
   * 두 번 누르면 크기가 3단계로 순환한다. 상태는 이 셸만 알며 통화 로직과 무관하다.
   */
  const [pipCorner, setPipCorner] = useState<PipCorner>('bottom-right')
  const [pipSizeIndex, setPipSizeIndex] = useState(1)
  /** 끌기 진행 중의 위치(px, 무대 기준)다. 값이 없으면 모서리에 붙어 있다. */
  const [pipPosition, setPipPosition] = useState<{ x: number; y: number }>()
  const pipDragRef = useRef<{
    pointerId: number
    offsetX: number
    offsetY: number
    startClientX: number
    startClientY: number
    moved: boolean
  } | null>(null)

  const handlePipPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const figure = event.currentTarget
    const rect = figure.getBoundingClientRect()
    pipDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
    }
    figure.setPointerCapture(event.pointerId)
  }

  const handlePipPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = pipDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    // 살짝 눌렀다 뗀 것(더블클릭 크기 변경)까지 끌기로 처리하지 않는다.
    if (
      !drag.moved &&
      Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) <
        PIP_DRAG_THRESHOLD
    ) {
      return
    }
    drag.moved = true

    const figure = event.currentTarget
    const parent = figure.parentElement
    if (!parent) return
    const parentRect = parent.getBoundingClientRect()
    const figureRect = figure.getBoundingClientRect()

    setPipPosition({
      x: Math.min(
        Math.max(event.clientX - parentRect.left - drag.offsetX, 0),
        parentRect.width - figureRect.width,
      ),
      y: Math.min(
        Math.max(event.clientY - parentRect.top - drag.offsetY, 0),
        parentRect.height - figureRect.height,
      ),
    })
  }

  const handlePipPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = pipDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    pipDragRef.current = null
    if (!drag.moved) return

    // 놓은 지점의 중심이 무대의 어느 사분면에 있는지로 붙을 모서리를 정한다.
    const figure = event.currentTarget
    const parent = figure.parentElement
    if (parent) {
      const parentRect = parent.getBoundingClientRect()
      const figureRect = figure.getBoundingClientRect()
      const centerX = figureRect.left + figureRect.width / 2 - parentRect.left
      const centerY = figureRect.top + figureRect.height / 2 - parentRect.top
      const vertical = centerY < parentRect.height / 2 ? 'top' : 'bottom'
      const horizontal = centerX < parentRect.width / 2 ? 'left' : 'right'
      setPipCorner(`${vertical}-${horizontal}` as PipCorner)
    }
    setPipPosition(undefined)
  }

  /**
   * 카운트다운이 1에서 사라지는 순간(=촬영 순간) 찰칵 플래시를 터뜨린다.
   *
   * 셔터를 누른 쪽과 신호를 받은 쪽 모두 같은 조건이므로 양쪽 화면이 함께 번쩍인다.
   * 1을 거치지 않고 사라진 경우(중도 취소)에는 터뜨리지 않는다.
   */
  const previousCountdownRef = useRef(captureCountdown)
  useEffect(() => {
    if (previousCountdownRef.current === 1 && captureCountdown === undefined) {
      setShutterFlashCount((count) => count + 1)
    }
    previousCountdownRef.current = captureCountdown
  }, [captureCountdown])

  /** 투명 아이콘 버튼 공통 모양이다. 배경 대신 그림자로 밝은 영상 위 가독성을 지킨다. */
  const iconButtonClass =
    'grid size-9 place-items-center rounded-full text-white transition-colors [filter:drop-shadow(0_1px_6px_rgb(0_0_0/80%))] hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50'

  return (
    <section
      aria-label={t('callStage.t1')}
      // 폭 기준 16:9로 그리면 넓은 화면에서 세로가 뷰포트를 넘어 스크롤이 생긴다.
      // 항상 "뷰포트 높이 - 헤더 - 아래 안내 여유"만큼만 차지해 어떤 기기에서도 화면 안에
      // 들어오게 하고, 영상은 object-cover라 비율이 달라져도 잘리기만 할 뿐 찌그러지지 않는다.
      className="relative h-[calc(100dvh-var(--service-header-height)-150px)] min-h-[320px] overflow-hidden rounded-xl bg-[var(--color-surface-dark-media)]"
    >
      <div className="absolute inset-0">{remoteVideo}</div>

      {/*
        찰칵 플래시 — 카운트다운이 끝나는 순간 흰 화면이 잠깐 번쩍인다. key가 누적 횟수라
        연달아 찍어도 애니메이션이 매번 처음부터 다시 돈다. 애니메이션이 끝나면 기본
        opacity-0으로 돌아가 화면을 가리지 않고, 모션 최소화 설정에서는 번쩍이지 않는다.
      */}
      {shutterFlashCount > 0 ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-30 bg-white opacity-0 motion-safe:animate-[mj-shutter-flash_360ms_ease-out]"
          key={shutterFlashCount}
        />
      ) : null}

      {/*
        찰칵 직후 썸네일 — 찍힌 프레임이 셔터 버튼 쪽으로 날아가 흡수된다.
        연출용이라 pointer-events가 없고, 모션 최소화 설정에서는 그리지 않는다.
      */}
      {captureFlight ? (
        <img
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute z-30 hidden w-[26%] rounded-lg border-2 border-white motion-safe:block motion-safe:animate-[mj-photo-fly_650ms_cubic-bezier(0.5,0,0.8,0.4)_120ms_both]"
          key={captureFlight.id}
          src={captureFlight.url}
        />
      ) : null}

      {/*
        촬영 카운트다운 — 3·2·1이 화면 중앙에 크게 뜬다. 숫자마다 key가 갈려
        커졌다 자리 잡는 모션이 반복되고, 상대 화면에도 같은 숫자가 떠 함께 포즈를 잡는다.
      */}
      {captureCountdown === undefined ? null : (
        <div
          // 숫자만 바뀌어도 안내 문장까지 한 덩어리로 다시 읽어 주게 한다.
          aria-atomic="true"
          aria-live="assertive"
          className="pointer-events-none absolute inset-0 z-20 grid place-items-center"
          role="status"
        >
          <div className="text-center" key={captureCountdown}>
            <span className="sr-only">{t('callStage.captureCountdownAria', { p0: captureCountdown })}</span>
            <strong
              aria-hidden="true"
              className="block text-[clamp(72px,12vw,120px)] font-black leading-none text-white [text-shadow:0_2px_28px_rgb(0_0_0/85%)] motion-safe:animate-[mj-shutter-count_640ms_cubic-bezier(0.16,1,0.3,1)_both]"
            >
              {captureCountdown}
            </strong>
            <span
              aria-hidden="true"
              className="mt-2 block text-[17px] font-bold text-white/85 [text-shadow:0_1px_10px_rgb(0_0_0/85%)]"
            >
              {t('callStage.captureCountdownLabel')}
            </span>
          </div>
        </div>
      )}

      {/*
        남은 시간 헤어라인 게이지 — 바를 만들지 않고 화면 맨 위 가장자리 3px로만 잔여 시간을
        알린다. 숫자를 읽지 않아도 줄어드는 것이 감각으로 온다. 값이 없으면 통째로 숨긴다.
      */}
      {timeRatio === undefined ? null : (
        <div aria-hidden="true" className="absolute inset-x-0 top-0 z-20 h-[3px] bg-white/10">
          <div
            className={cn(
              'h-full transition-[width] duration-500 ease-linear',
              timeUrgency === 'critical'
                ? 'bg-[var(--color-error-on-dark)] motion-safe:animate-pulse'
                : timeUrgency === 'warning'
                  ? 'bg-[var(--color-warning-on-dark)]'
                  : 'bg-[var(--color-primary-coral)]',
            )}
            style={{ width: `${Math.min(100, Math.max(0, timeRatio)) * 100}%` }}
          />
        </div>
      )}

      {/* 좌상단 — 상대 이름. 배경 없이 그림자 글자로 두고, 연결 상태는 점 색과 짧은 문구로 알린다. */}
      <div className="absolute left-3.5 top-3 z-20 flex max-w-[46%] items-center gap-2 [filter:drop-shadow(0_1px_6px_rgb(0_0_0/80%))]">
        <span
          aria-hidden="true"
          className="grid size-6 flex-none place-items-center rounded-full bg-white/18 text-[11px] font-extrabold text-white"
        >
          {[...remoteName][0] ?? '?'}
        </span>
        <strong className="truncate text-[15px] font-extrabold tracking-[-0.02em] text-white">
          {remoteName}
        </strong>
        <span
          aria-hidden="true"
          className={cn(
            'size-1.5 flex-none rounded-full',
            connected ? 'bg-[var(--color-success-on-dark)]' : 'bg-[var(--color-warning-on-dark)]',
          )}
        />
        <span
          className={cn(
            'truncate text-xs font-bold',
            connected ? 'text-white/60' : 'text-[var(--color-warning-on-dark)]',
          )}
        >
          {connectionLabel}
        </span>
      </div>

      {/*
        우상단 — 타이머와 투명 아이콘 조작 줄. 배경 있는 독을 만들지 않아 영상이 주인공으로
        남는다. 종료가 임박하면 타이머가 경고색으로 바뀌고 떨린다.
      */}
      <div className="absolute right-3.5 top-3 z-20 flex items-center gap-1 [filter:drop-shadow(0_1px_6px_rgb(0_0_0/80%))]">
        <p className="mr-2 flex items-baseline gap-1.5">
          <span className="sr-only">{timeLabel}</span>
          {/*
            10초 이하부터 글자가 커지고 떨리기 시작한다(주황). 5초 이하에서는 빨강으로
            바뀌고 떨림이 빨라져 마지막임이 확실해진다.
            transform 애니메이션이 걸리도록 inline-block으로 둔다(인라인 요소에는 transform이 듣지 않는다).
          */}
          <strong
            className={cn(
              'inline-block font-black leading-none tracking-[-0.03em] tabular-nums transition-[font-size] duration-300',
              timeUrgency === 'critical'
                ? 'text-2xl text-[var(--color-error-on-dark)] motion-safe:animate-[mj-timer-shake_380ms_ease-in-out_infinite]'
                : timeUrgency === 'warning'
                  ? 'text-xl text-[var(--color-warning-on-dark)] motion-safe:animate-[mj-timer-shake_560ms_ease-in-out_infinite]'
                  : 'text-lg text-white',
            )}
            title={timeLabel}
          >
            {timeValue}
          </strong>
        </p>
        <button
          aria-label={t('callStage.t19', { p0: microphoneEnabled ? t('callStage.t9') : t('callStage.t10') })}
          className={cn(
            iconButtonClass,
            !microphoneEnabled && 'bg-white/10 text-[var(--color-error-on-dark)]',
          )}
          disabled={mediaAction === 'microphone'}
          onClick={onMicrophoneToggle}
          title={t('callStage.t2')}
          type="button"
        >
          {microphoneEnabled ? (
            <MicrophoneIcon size={18} weight="fill" />
          ) : (
            <MicrophoneSlashIcon size={18} weight="fill" />
          )}
        </button>
        <button
          aria-label={t('callStage.t20', { p0: cameraEnabled ? t('callStage.t13') : t('callStage.t14') })}
          className={cn(
            iconButtonClass,
            !cameraEnabled && 'bg-white/10 text-[var(--color-error-on-dark)]',
          )}
          disabled={mediaAction === 'camera'}
          onClick={onCameraToggle}
          title={t('callStage.t3')}
          type="button"
        >
          {cameraEnabled ? (
            <VideoCameraIcon size={18} weight="fill" />
          ) : (
            <VideoCameraSlashIcon size={18} weight="fill" />
          )}
        </button>
        {/* 기념 사진 셔터 — 조작 줄에서 유일하게 채워진 흰 원이라 한눈에 찾힌다. */}
        {onCapture ? (
          <button
            aria-label={captureLabel ? `${t('callStage.captureAria')} — ${captureLabel}` : t('callStage.captureAria')}
            className="mx-0.5 grid size-9 place-items-center rounded-full bg-white text-[var(--color-surface-dark)] transition-transform hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-45 motion-reduce:transform-none"
            disabled={captureDisabled || captureCountdown !== undefined}
            onClick={onCapture}
            title={captureLabel ?? t('callStage.capture')}
            type="button"
          >
            <CameraIcon size={18} weight="fill" />
          </button>
        ) : null}
        {reactionEmojis?.length && onReactionSend ? (
          <button
            aria-expanded={reactionsOpen}
            aria-label={t('callStage.reactionGroup')}
            className={cn(iconButtonClass, reactionsOpen && 'bg-white/10')}
            onClick={() => setReactionsOpen((open) => !open)}
            type="button"
          >
            <SmileyIcon size={18} weight="fill" />
          </button>
        ) : null}
        <button
          aria-checked={captionEnabled}
          aria-label={t('callStage.t22', { p0: captionEnabled ? t('callStage.t17') : t('callStage.t18') })}
          className={cn(iconButtonClass, !captionEnabled && 'text-white/45')}
          onClick={onCaptionToggle}
          role="switch"
          title={t('callStage.t6')}
          type="button"
        >
          {/* 꺼진 상태는 마이크·카메라 꺼짐과 같은 문법으로 사선을 그어 한눈에 구분되게 한다. */}
          <span className="relative grid place-items-center">
            <ClosedCaptioningIcon size={18} weight={captionEnabled ? 'fill' : 'regular'} />
            {captionEnabled ? null : (
              <span
                aria-hidden="true"
                className="absolute h-[2px] w-[24px] rotate-45 rounded-full bg-current"
              />
            )}
          </span>
        </button>
        {/* 종료는 유일하게 채워진 빨간 원으로 두어 무엇을 끊는 버튼인지 헷갈리지 않게 한다. */}
        <button
          aria-label={t('callStage.t4')}
          className="ml-0.5 grid size-9 place-items-center rounded-full bg-[var(--color-error)] text-white shadow-[0_2px_10px_rgb(0_0_0/45%)] transition-transform hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transform-none"
          onClick={onLeave}
          title={t('callStage.t4')}
          type="button"
        >
          <PhoneDisconnectIcon size={18} weight="fill" />
        </button>
      </div>

      {/* 리액션 팔레트 — 조작 줄 바로 아래로 펼쳐진다. */}
      {reactionsOpen && reactionEmojis?.length && onReactionSend ? (
        <div
          aria-label={t('callStage.reactionGroup')}
          // 이모지가 열 개라 한 줄로 두면 좁은 화면에서 왼쪽이 잘린다. 접히게 두고 폭을 제한해
          // 화면을 벗어나지 않게 하고, 여러 줄이 되면 둥근 모서리를 알약에서 사각으로 바꾼다.
          className="absolute right-3.5 top-[52px] z-20 flex max-w-[min(72vw,300px)] flex-wrap items-center justify-end gap-1 rounded-2xl border border-white/10 bg-[rgb(15_17_21/62%)] px-2 py-1.5 backdrop-blur-md"
          role="group"
        >
          {reactionEmojis.map((emoji) => (
            <button
              aria-label={t('callStage.reactionSend', { p0: emoji })}
              className="min-h-9 rounded-full px-2 text-xl leading-none transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:hover:scale-100"
              key={emoji}
              onClick={() => onReactionSend(emoji)}
              type="button"
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}

      {/* 장치 이상 배너 — 통화를 가리지 않고 상단에 원인과 복구 행동을 띄운다. */}
      {deviceAlert ? (
        <div
          className="absolute inset-x-[17px] top-[56px] z-20 flex flex-wrap items-center justify-between gap-4 rounded-lg bg-[var(--color-warning)]/95 px-[15px] py-[13px]"
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

      {/*
        내 화면 PIP — 라벨·캡션 없이 창만 남긴다. 접근성 이름은 figure의 aria-label이 유지한다.
        끌면 가장 가까운 모서리에 붙고, 두 번 누르면 크기가 3단계로 순환한다.
      */}
      <figure
        aria-label={t('callStage.t21', { p0: localParticipantLabelResolved })}
        className={cn(
          'absolute z-10 m-0 cursor-grab touch-none select-none overflow-hidden rounded-[10px] border border-white/15 bg-[var(--color-surface-dark-media)] shadow-[0_6px_24px_rgb(0_0_0/42%)] active:cursor-grabbing',
          PIP_WIDTH_CLASSES[pipSizeIndex],
          pipPosition ? '' : PIP_CORNER_CLASS[pipCorner],
        )}
        onDoubleClick={() => setPipSizeIndex((index) => (index + 1) % PIP_WIDTH_CLASSES.length)}
        onPointerCancel={handlePipPointerUp}
        onPointerDown={handlePipPointerDown}
        onPointerMove={handlePipPointerMove}
        onPointerUp={handlePipPointerUp}
        style={pipPosition ? { left: pipPosition.x, top: pipPosition.y } : undefined}
        title={t('callStage.pipHint')}
      >
        <div className="pointer-events-none relative aspect-[4/3] w-full">{localVideo}</div>
      </figure>

      {/*
        실시간 자막 — 박스 없이 그림자 글자만 띄운다(영화 자막 방식). 1:1 통화라 화자는 항상
        상대방이므로 이름표도 생략한다.
      */}
      {captionEnabled && captionLines?.length ? (
        <div
          aria-live="polite"
          className="absolute bottom-[22px] left-1/2 z-10 max-w-[min(72%,640px)] -translate-x-1/2 text-center"
        >
          {captionLines.map((line, index) => (
            <p
              className={index ? 'mt-1.5' : ''}
              // 자막 식별자를 우선 쓴다. 발화 내용으로만 식별하면 같은 말("네")이 반복될 때
              // key가 겹쳐 React가 다른 줄로 인식하지 못한다.
              key={line.id ?? `${line.speaker}:${line.text}`}
            >
              {/* 자라는 중인 부분 자막은 옅게 두어 "아직 확정 전"임이 드러나게 한다. */}
              <span
                className={cn(
                  'block text-lg font-bold leading-[1.45] [text-shadow:0_1px_12px_rgb(0_0_0/90%),0_0_2px_rgb(0_0_0/85%)]',
                  line.pending ? 'text-white/75' : 'text-white',
                )}
              >
                {line.text}
              </span>
              {/* 번역문은 원문을 대체하지 않고 아래에 덧붙인다. 원문과 구분되게 한 단계 흐리게 둔다. */}
              {line.translatedText ? (
                <span className="mt-[3px] block text-base font-semibold leading-[1.45] text-white/80 [text-shadow:0_1px_12px_rgb(0_0_0/90%),0_0_2px_rgb(0_0_0/85%)]">
                  {line.translatedText}
                </span>
              ) : null}
            </p>
          ))}
        </div>
      ) : null}

      {/*
        떠오르는 리액션 — 화면 전체를 덮지만 `pointer-events-none`이라 아래 조작을 가리지 않는다.
        영상 위에 잠깐 떴다 사라지는 표현이므로 레이아웃을 차지하지 않게 absolute로 둔다.
      */}
      {floatingReactions?.length ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          {floatingReactions.map((reaction) => (
            <span
              className="absolute bottom-[120px] text-[38px] leading-none motion-safe:animate-[mj-reaction-float_2200ms_cubic-bezier(0.2,0.6,0.3,1)_forwards] motion-reduce:opacity-80"
              key={reaction.id}
              style={{ left: `${reaction.leftPercent}%` }}
            >
              {reaction.emoji}
            </span>
          ))}
        </div>
      ) : null}

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
