import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertBanner, Button, Dialog, Textarea } from '../../components'
import { getAuthSession } from '../../api/authSession'
import { ApiError } from '../../api/ApiError'
import {
  fetchPublicFanMeetingDetail,
  type PublicFanMeetingDetail,
} from '../../api/fanMeetings'
import { enterQueue, getMyQueue, type QueueSnapshotResponse } from '../../api/queue'
import { getMeetingNotice, getMeetingNotices } from '../../api/notices'
import { createQueueChangeRequest } from '../../api/queueManagement'

/** 호출 후 입장할 수 있는 시간(초)이다. 정책 문구(30초)와 같은 값을 쓴다. */
const CALL_WINDOW_SEC = 30
/** 호출 만료 후 대기열에 다시 등록할 수 있는 시간(초)이다. 정책 문구(5분)와 같은 값을 쓴다. */
const REENTER_WINDOW_SEC = 5 * 60
const MAX_CHANGE_REASON_LENGTH = 500
const MEMO_MAX_LENGTH = 200

type WaitingPhase = 'waiting' | 'called' | 'expired' | 'disconnected'

type NoticeItem = {
  noticeId: number
  title: string
  body: string
  when: string
  urgent: boolean
}

/** DeviceCheckPage가 sessionStorage에 저장하는 장비 점검 기록이다. */
function readDeviceChecked(meetingId: string): boolean | undefined {
  try {
    const serialized = window.sessionStorage.getItem(`melly-device-check:${meetingId}`)
    if (!serialized) return undefined
    const record: unknown = JSON.parse(serialized)
    if (typeof record !== 'object' || record === null) return undefined
    const parsed = record as Record<string, unknown>
    return parsed.cameraOk === true && parsed.microphoneOk === true
  } catch {
    return undefined
  }
}

function memoStorageKey(meetingId: string) {
  return `melly-fan-note:${meetingId}`
}

function pad(part: number) {
  return String(part).padStart(2, '0')
}

/** 00:27 형태의 카운트다운 표기다. */
function formatCountdown(totalSec: number): string {
  const safe = Math.max(0, totalSec)
  return `${pad(Math.floor(safe / 60))}:${pad(safe % 60)}`
}

function formatNoticeAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())} 게시`
}

/**
 * 이미 허용된 브라우저 기능만 사용해 호출을 보조한다.
 * Notification 권한을 여기서 요청하지 않으므로 대기 중 갑작스러운 권한 팝업이 뜨지 않는다.
 */
function notifyFanCall(meetingTitle: string) {
  if ('Notification' in window && window.Notification.permission === 'granted') {
    try {
      new window.Notification('팬미팅 호출', {
        body: `${meetingTitle}에 지금 입장해 주세요.`,
        tag: 'melly-fan-meeting-call',
      })
    } catch {
      // OS 알림을 만들 수 없어도 화면 알림과 문서 제목 변경은 계속 제공한다.
    }
  }

  // 진동은 지원하는 모바일 브라우저에서만 동작하며 별도 권한을 요청하지 않는다.
  try {
    window.navigator.vibrate?.([180, 100, 180])
  } catch {
    // 브라우저 정책으로 진동이 차단되면 조용히 건너뛴다.
  }

  // 사용자 상호작용이 있었던 브라우저에서는 짧은 호출음을 재생한다. 자동 재생 차단은 정상이다.
  const AudioContextConstructor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextConstructor) return

  try {
    const context = new AudioContextConstructor()
    void context.resume()
      .then(() => {
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        gain.gain.value = 0.08
        oscillator.frequency.value = 880
        oscillator.connect(gain)
        gain.connect(context.destination)
        oscillator.addEventListener('ended', () => void context.close(), { once: true })
        oscillator.start()
        oscillator.stop(context.currentTime + 0.35)
      })
      .catch(() => void context.close())
  } catch {
    // Web Audio가 차단된 환경에서도 시각·보조기기 알림은 유지한다.
  }
}

export function FanMeetingWaitingPage() {
  const { fanMeetingId } = useParams()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<PublicFanMeetingDetail>()
  const [queueSnapshot, setQueueSnapshot] = useState<QueueSnapshotResponse>()
  const [notices, setNotices] = useState<NoticeItem[]>([])
  const [noticeTotal, setNoticeTotal] = useState(0)
  const [meetingError, setMeetingError] = useState<string>()
  const [queueError, setQueueError] = useState<string>()
  const [online, setOnline] = useState(() => navigator.onLine)
  const [pollBroken, setPollBroken] = useState(false)
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000))
  const [reentering, setReentering] = useState(false)

  const [memo, setMemo] = useState(() =>
    fanMeetingId
      ? (window.sessionStorage.getItem(memoStorageKey(fanMeetingId)) ?? '')
      : '',
  )
  const [memoEditing, setMemoEditing] = useState(false)

  const [changeDialogOpen, setChangeDialogOpen] = useState(false)
  const [changeReason, setChangeReason] = useState('')
  const [isRequestingChange, setIsRequestingChange] = useState(false)
  const [changeRequested, setChangeRequested] = useState(false)
  const [changeError, setChangeError] = useState<string>()

  const originalDocumentTitleRef = useRef(document.title)
  const callAnnouncedRef = useRef(false)
  const pollFailCountRef = useRef(0)

  const deviceChecked = useMemo(
    () => (fanMeetingId ? readDeviceChecked(fanMeetingId) : undefined),
    [fanMeetingId],
  )

  const loadMeetingInfo = useCallback(async (signal?: AbortSignal) => {
    if (!fanMeetingId) return

    const session = getAuthSession()
    if (!session || session.role !== 'FAN') {
      setMeetingError('팬 계정으로 로그인한 뒤 대기실을 이용해 주세요.')
      return
    }

    try {
      const nextDetail = await fetchPublicFanMeetingDetail(
        Number(fanMeetingId),
        session.accessToken,
        signal,
      )
      setDetail(nextDetail)
      setMeetingError(undefined)
    } catch (reason) {
      if (signal?.aborted) return
      setMeetingError(
        reason instanceof ApiError || reason instanceof TypeError
          ? reason.message
          : '팬미팅 정보를 불러오지 못했습니다.',
      )
    }
  }, [fanMeetingId])

  const loadQueueState = useCallback(async (signal?: AbortSignal) => {
    if (!fanMeetingId) return

    const session = getAuthSession()
    if (!session || session.role !== 'FAN') {
      setQueueError('팬 계정으로 로그인한 뒤 대기실을 이용해 주세요.')
      return
    }

    try {
      const nextQueueSnapshot = await getMyQueue(fanMeetingId, session.accessToken, signal)
      setQueueSnapshot(nextQueueSnapshot)
      setQueueError(undefined)
      pollFailCountRef.current = 0
      setPollBroken(false)

      if (nextQueueSnapshot.displayStatus === 'COMPLETED') {
        navigate(`/fan/fan-meetings/${fanMeetingId}/complete`, { replace: true })
      }
    } catch (reason) {
      if (signal?.aborted) return
      // 일시적 실패 한 번으로 화면을 바꾸지 않고, 연속 실패가 쌓이면 재연결 상태로 전환한다.
      pollFailCountRef.current += 1
      if (pollFailCountRef.current >= 2) setPollBroken(true)
      setQueueError(
        reason instanceof ApiError || reason instanceof TypeError
          ? reason.message
          : '대기열 상태를 불러오지 못했습니다.',
      )
    }
  }, [fanMeetingId, navigate])

  useEffect(() => {
    const controller = new AbortController()
    void loadMeetingInfo(controller.signal)
    return () => controller.abort()
  }, [loadMeetingInfo])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    let timer: number | undefined

    // 이전 요청이 끝난 뒤 다음 요청을 예약해 느린 네트워크에서 응답 순서가 뒤집히지 않게 한다.
    const poll = async () => {
      await loadQueueState(controller.signal)
      if (active) timer = window.setTimeout(() => void poll(), 3_000)
    }
    void poll()

    return () => {
      active = false
      controller.abort()
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [loadQueueState])

  // 운영 공지 — 게시된 공지만 내려오는 공개 API를 쓰고, 본문은 상세에서 보강한다.
  useEffect(() => {
    if (!fanMeetingId) return

    const controller = new AbortController()

    void (async () => {
      try {
        const page = await getMeetingNotices(
          fanMeetingId,
          { page: 0, size: 2 },
          controller.signal,
        )
        const items = await Promise.all(
          page.content.map(async (summary) => {
            const noticeDetail = await getMeetingNotice(
              fanMeetingId,
              summary.noticeId,
              controller.signal,
            )
            return {
              noticeId: summary.noticeId,
              title: summary.title,
              body: noticeDetail.content,
              when: formatNoticeAt(summary.createdAt),
              urgent: summary.pinned,
            }
          }),
        )
        if (!controller.signal.aborted) {
          setNotices(items)
          setNoticeTotal(page.totalElements)
        }
      } catch {
        // 공지는 보조 정보이므로 실패해도 대기실 자체는 유지한다.
      }
    })()

    return () => controller.abort()
  }, [fanMeetingId])

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // 호출 카운트다운과 재등록 카운트다운은 초 단위로 흘러야 하므로 1초 틱을 돌린다.
  const calledAt = queueSnapshot?.calledAt ?? null
  useEffect(() => {
    if (!calledAt) return
    const timer = window.setInterval(
      () => setNowSec(Math.floor(Date.now() / 1000)),
      1_000,
    )
    setNowSec(Math.floor(Date.now() / 1000))
    return () => window.clearInterval(timer)
  }, [calledAt])

  const calledAtSec = calledAt ? Math.floor(new Date(calledAt).getTime() / 1000) : null
  const callRemainSec =
    calledAtSec !== null ? calledAtSec + CALL_WINDOW_SEC - nowSec : null
  const canEnter = Boolean(queueSnapshot?.canEnterCall && queueSnapshot.callSessionId)

  const phase: WaitingPhase =
    !online || pollBroken
      ? 'disconnected'
      : canEnter && callRemainSec !== null && callRemainSec > 0
        ? 'called'
        : calledAtSec !== null &&
            callRemainSec !== null &&
            callRemainSec <= 0 &&
            queueSnapshot?.displayStatus === 'WAITING'
          ? 'expired'
          : 'waiting'
  const isCalled = phase === 'called'
  const isWarn = phase === 'expired' || phase === 'disconnected'

  const reenterRemainSec =
    phase === 'expired' && calledAtSec !== null
      ? Math.max(0, calledAtSec + CALL_WINDOW_SEC + REENTER_WINDOW_SEC - nowSec)
      : null

  useEffect(() => {
    const meetingTitle = detail?.meeting.title ?? '팬미팅'

    if (isCalled) {
      document.title = `[호출] ${meetingTitle} | ${originalDocumentTitleRef.current}`
      if (!callAnnouncedRef.current) {
        callAnnouncedRef.current = true
        notifyFanCall(meetingTitle)
      }
      return
    }

    callAnnouncedRef.current = false
    document.title = originalDocumentTitleRef.current
  }, [detail?.meeting.title, isCalled])

  useEffect(() => {
    return () => {
      document.title = originalDocumentTitleRef.current
    }
  }, [])

  if (!fanMeetingId) {
    return null
  }

  const influencerName = detail?.influencer.name ?? '인플루언서'
  const position = queueSnapshot?.position
  const ahead = queueSnapshot?.aheadCount ?? 0
  const estimatedWaitMinutes = Math.ceil((queueSnapshot?.estimatedWaitSec ?? 0) / 60)

  // dc.html의 상태별 문구 표를 실제 상태에 대응시킨다.
  const stateContent = {
    waiting: {
      title: '호출을 기다려 주세요',
      desc: '내 차례가 되면 이 화면에서 바로 알려드릴게요. 창을 열어둔 채로 기다려 주세요.',
      helper: '현재 순번을 유지하고 있습니다.',
      cta: '호출 대기 중',
      disabled: true,
    },
    called: {
      title: `${influencerName}님이 기다리고 있어요`,
      desc: '지금 입장하면 바로 영상통화가 연결됩니다.',
      helper: `${position ?? '-'}번째 · 연결 상태 정상`,
      cta: '지금 입장',
      disabled: false,
    },
    expired: {
      title: '입장 시간이 지났어요',
      desc: '응답 시간이 지나 이번 호출이 취소되었습니다. 5분 안에 다시 등록하면 대기열로 돌아갈 수 있어요.',
      helper: `재등록 가능 시간 ${formatCountdown(reenterRemainSec ?? 0)}`,
      cta: '대기열 재등록',
      disabled: reentering,
    },
    disconnected: {
      title: '연결을 복구하고 있어요',
      desc: '네트워크 연결이 잠시 끊어졌습니다. 대기 순번은 그대로 유지됩니다.',
      helper: '같은 순번으로 재연결을 시도하고 있어요.',
      cta: '다시 연결',
      disabled: false,
    },
  }[phase]

  const statusLine = `${
    phase === 'disconnected' ? '재연결 중' : phase === 'expired' ? '호출 만료' : '연결 상태 정상'
  } · 장비 점검 ${deviceChecked === undefined ? '미확인' : deviceChecked ? '완료' : '미완료'}`

  const motifPct = isCalled
    ? 100
    : position && position > 1
      ? Math.round(
          ((position - 1 - Math.min(ahead, position - 1)) / (position - 1)) * 76,
        ) + 12
      : 12
  const etaText = isCalled
    ? '지금'
    : ahead > 0
      ? `약 ${Math.max(estimatedWaitMinutes, 1)}분`
      : '1분 이내'

  function handleCtaClick() {
    if (phase === 'called') {
      if (!queueSnapshot?.callSessionId) return
      navigate(
        `/fan/fan-meetings/${fanMeetingId}/calls/${encodeURIComponent(String(queueSnapshot.callSessionId))}`,
      )
      return
    }
    if (phase === 'expired') {
      const session = getAuthSession()
      if (!session) return
      setReentering(true)
      void enterQueue(fanMeetingId ?? '', session.accessToken)
        .catch(() => undefined)
        .then(() => loadQueueState())
        .finally(() => setReentering(false))
      return
    }
    if (phase === 'disconnected') {
      pollFailCountRef.current = 0
      setPollBroken(false)
      void loadMeetingInfo()
      void loadQueueState()
    }
  }

  function toggleMemoEdit() {
    if (memoEditing) {
      try {
        window.sessionStorage.setItem(memoStorageKey(fanMeetingId ?? ''), memo)
      } catch {
        // 저장 공간 문제로 실패해도 화면의 메모는 유지된다.
      }
    }
    setMemoEditing((editing) => !editing)
  }

  async function handleChangeRequestSubmit() {
    if (isRequestingChange || !queueSnapshot) return

    const session = getAuthSession()
    if (!session || session.role !== 'FAN') {
      setChangeError('팬 계정으로 로그인한 뒤 요청해 주세요.')
      return
    }

    const trimmed = changeReason.trim()
    if (!trimmed) {
      setChangeError('요청 사유를 입력해 주세요.')
      return
    }
    if (trimmed.length > MAX_CHANGE_REASON_LENGTH) {
      setChangeError(`요청 사유는 ${MAX_CHANGE_REASON_LENGTH}자 이하로 입력해 주세요.`)
      return
    }

    setIsRequestingChange(true)
    setChangeError(undefined)

    try {
      await createQueueChangeRequest(queueSnapshot.queueEntryId, trimmed, session.accessToken)
      setChangeRequested(true)
      setChangeDialogOpen(false)
      setChangeReason('')
    } catch (reason) {
      setChangeError(
        reason instanceof ApiError && reason.status === 409
          ? '이미 접수된 순서 변경 요청이 있습니다.'
          : reason instanceof ApiError || reason instanceof TypeError
            ? reason.message
            : '순서 변경 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      )
    } finally {
      setIsRequestingChange(false)
    }
  }

  const urgentNotice = notices.some((notice) => notice.urgent)
  const error = meetingError ?? (phase === 'disconnected' ? undefined : queueError)

  return (
    <div className="-mx-4 -mt-8 sm:-mx-6 lg:-mx-10 lg:-mt-10">
      {/* 호출 전환을 색상에 의존하지 않고 스크린 리더에도 즉시 알린다. */}
      <p aria-atomic="true" aria-live="assertive" className="sr-only">
        {isCalled ? '팬미팅에 호출되었습니다. 지금 입장해 주세요.' : '팬미팅 호출 대기 중입니다.'}
      </p>

      {error ? (
        <div className="mx-auto w-[min(100%-40px,1240px)] pt-6">
          <AlertBanner title="대기실 정보를 확인할 수 없습니다" variant="error">
            <p>{error}</p>
            <Button
              className="mt-3"
              onClick={() => {
                void loadMeetingInfo()
                void loadQueueState()
              }}
              size="sm"
              variant="secondary"
            >
              다시 확인
            </Button>
          </AlertBanner>
        </div>
      ) : null}

      <section
        aria-label="대기 상태"
        className="grid grid-cols-1 items-stretch border-b border-[var(--color-divider)] transition-[grid-template-columns] duration-[640ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none min-[1081px]:grid-cols-[var(--wait-cols)]"
        style={{ '--wait-cols': isCalled ? 'minmax(0,1fr) 384px' : 'minmax(0,1fr) 484px' } as React.CSSProperties}
      >
        <div
          className="relative min-h-[min(52vw,420px)] overflow-hidden bg-[var(--color-surface-muted)] transition-[min-height] duration-[640ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none min-[1081px]:min-h-[var(--wait-img-h)]"
          style={{ '--wait-img-h': isCalled ? '620px' : '540px' } as React.CSSProperties}
        >
          {detail?.meeting.coverImageUrl ? (
            <img
              alt={`팬미팅을 준비하고 있는 ${influencerName}`}
              className="absolute inset-0 size-full object-cover"
              src={detail.meeting.coverImageUrl}
            />
          ) : (
            <div
              aria-label="대표 이미지가 등록되지 않은 팬미팅"
              className="absolute inset-0 grid place-items-center"
              role="img"
            >
              <span className="text-sm font-semibold text-[var(--color-text-muted)]">
                이미지 없음
              </span>
            </div>
          )}
          {/* 호출 시 이미지 위 코랄 스크림이 짙어진다. (handoff 젤리 규칙 2) */}
          <span
            aria-hidden="true"
            className="absolute inset-0 transition-[background] duration-500"
            style={{
              background: `linear-gradient(180deg, rgba(23,24,29,0) 46%, rgba(217,66,63,${isCalled ? 0.46 : 0.12}) 100%)`,
            }}
          />
          <span
            aria-hidden="true"
            className={`mj-seam-glow absolute inset-y-0 right-0 hidden w-[88px] transition-opacity duration-[420ms] min-[1081px]:block ${isCalled ? 'motion-safe:animate-[mj-seam-shift_3.2s_ease-in-out_infinite]' : ''}`}
            style={{
              opacity: isCalled ? 0.95 : isWarn ? 0.26 : 0.55,
              background:
                'linear-gradient(90deg, rgba(232,97,92,0) 0%, rgba(232,97,92,0.16) 62%, rgba(217,66,63,0.34) 100%)',
            }}
          />
          <span
            aria-hidden="true"
            className="absolute inset-y-0 right-0 hidden w-[3px] transition-opacity duration-[420ms] min-[1081px]:block"
            style={{
              opacity: isWarn ? 0.4 : 0.9,
              background:
                'linear-gradient(180deg, rgba(232,97,92,0.25) 0%, rgba(217,66,63,0.95) 42%, rgba(232,97,92,0.35) 100%)',
            }}
          />
          <span
            aria-hidden="true"
            className="mj-seam-glow absolute inset-x-0 bottom-0 h-[72px] min-[1081px]:hidden"
            style={{
              opacity: isCalled ? 0.95 : isWarn ? 0.26 : 0.55,
              background: 'linear-gradient(180deg, rgba(232,97,92,0) 0%, rgba(217,66,63,0.3) 100%)',
            }}
          />
          <span
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-[4px] min-[1081px]:hidden"
            style={{
              opacity: isWarn ? 0.4 : 0.9,
              background:
                'linear-gradient(90deg, rgba(232,97,92,0) 0%, rgba(217,66,63,0.95) 50%, rgba(232,97,92,0) 100%)',
            }}
          />
          {isCalled && callRemainSec !== null ? (
            <div className="absolute inset-0 grid place-items-center text-center motion-safe:animate-[mj-lift_460ms_cubic-bezier(0.16,1,0.3,1)_both]">
              <div>
                <p className="text-[15px] font-bold text-white/95 [text-shadow:0_1px_14px_rgb(23_24_29_/_60%)]">
                  남은 입장 시간
                </p>
                <strong className="mt-2 block text-[clamp(48px,6.4vw,80px)] font-black leading-none tracking-[-0.05em] text-white tabular-nums [text-shadow:0_2px_26px_rgb(23_24_29_/_66%)]">
                  {formatCountdown(callRemainSec)}
                </strong>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col overflow-hidden px-5 pb-8 pt-[26px] sm:px-[26px] sm:pb-9 sm:pt-[30px] min-[1081px]:pb-11 min-[1081px]:pl-10 min-[1081px]:pr-11 min-[1081px]:pt-[46px]">
          <p
            className={`text-sm font-bold ${isWarn ? 'text-[var(--color-warning)]' : 'text-[var(--color-success)]'}`}
          >
            {statusLine}
          </p>
          <h1
            className={`mt-3.5 font-black leading-[1.16] tracking-[-0.045em] transition-[font-size] duration-[400ms] motion-reduce:transition-none [text-wrap:balance] ${isCalled ? 'text-[38px]' : 'text-[30px]'}`}
          >
            {stateContent.title}
          </h1>
          <p className="mt-3.5 text-[17px] font-medium leading-[1.7] text-[var(--color-text-body)]">
            {stateContent.desc}
          </p>

          <button
            className={`mj-font-emphasis mt-[26px] min-h-14 w-full rounded-[10px] border text-[17px] transition-[background-color,transform] duration-150 motion-reduce:transition-none ${
              stateContent.disabled
                ? 'cursor-not-allowed border-[var(--color-border-control)] bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]'
                : 'border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] text-white shadow-[var(--shadow-final-cta)] hover:-translate-y-px hover:bg-[var(--color-primary-coral-hover)] active:translate-y-px motion-reduce:transform-none'
            }`}
            disabled={stateContent.disabled}
            onClick={handleCtaClick}
            type="button"
          >
            {stateContent.cta}
          </button>
          <p aria-live="polite" className="mt-3 text-[15px] font-semibold text-[var(--color-text-muted)]">
            {stateContent.helper}
          </p>

          <div className="mt-[30px] border-t border-[var(--color-divider)] pt-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-[var(--color-text-muted)]">내 순번</p>
                <p className="mt-1.5 text-[34px] font-black leading-none tracking-[-0.04em] tabular-nums">
                  {position !== undefined ? `${position}번째` : '-'}
                </p>
              </div>
              {/* 대기 진행 모티프 — 앞 인원이 줄어들 때만 차오르는 액체 인디케이터다. (handoff 젤리 규칙 3) */}
              <span
                aria-label={isCalled ? '대기 진행 완료' : `대기 진행 ${motifPct}퍼센트`}
                className="relative h-9 w-[26px] flex-none overflow-hidden rounded-[5px_5px_13px_13px] bg-[var(--color-surface-page)]"
                role="img"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
                  style={{
                    height: `${motifPct}%`,
                    background:
                      'linear-gradient(180deg, var(--color-primary-coral-highlight), var(--color-primary-coral))',
                  }}
                />
              </span>
            </div>
            <p className="mt-4 text-base font-medium tabular-nums text-[var(--color-text-muted)]">
              앞에 <strong className="font-extrabold text-[var(--color-text-primary)]">{ahead > 0 ? `${ahead}명` : '없음'}</strong> · 예상{' '}
              <strong className="font-extrabold text-[var(--color-text-primary)]">{etaText}</strong>
            </p>
            {phase === 'waiting' ? (
              changeRequested ? (
                <p className="mt-3 text-sm font-semibold text-[var(--color-text-muted)]">
                  순서 변경 요청이 접수되었습니다.
                </p>
              ) : (
                <button
                  className="mj-font-label mt-3 min-h-9 text-sm text-[var(--color-text-muted)] underline underline-offset-4 hover:text-[var(--color-primary-coral)]"
                  onClick={() => {
                    setChangeError(undefined)
                    setChangeDialogOpen(true)
                  }}
                  type="button"
                >
                  지금 통화가 어려우면 순서 변경 요청
                </button>
              )
            ) : null}
            {changeError && !changeDialogOpen ? (
              <p className="mt-2 text-sm font-semibold text-[var(--color-error)]">{changeError}</p>
            ) : null}
          </div>
        </div>
      </section>

      {notices.length > 0 ? (
        <div className="mx-auto w-[min(100%-40px,1240px)] pt-[34px] min-[1081px]:w-[min(100%-88px,1240px)]">
          <section
            aria-labelledby="mj-notice-board"
            className={`rounded-xl border px-6 py-[22px] ${
              urgentNotice
                ? 'border-[var(--color-primary-coral-soft-border)] bg-[var(--color-primary-coral-soft)]'
                : 'border-[var(--color-divider)] bg-[var(--color-surface-subtle)]'
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <h2
                className={`text-[15px] font-extrabold tracking-[-0.02em] ${urgentNotice ? 'text-[var(--color-primary-coral)]' : 'text-[var(--color-text-muted)]'}`}
                id="mj-notice-board"
              >
                운영 공지
              </h2>
              <span className="text-sm font-semibold tabular-nums text-[var(--color-text-muted)]">
                {detail?.meeting.title ?? '팬미팅'} · {noticeTotal}건
              </span>
            </div>
            <div className="mt-3.5">
              {notices.map((notice, index) => (
                <article
                  className={index ? 'mt-4 border-t border-[var(--color-divider)] pt-4' : ''}
                  key={notice.noticeId}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-4">
                    <strong className="text-lg font-extrabold tracking-[-0.026em]">
                      {notice.title}
                    </strong>
                    <time className="whitespace-nowrap text-sm font-semibold tabular-nums text-[var(--color-text-muted)]">
                      {notice.when}
                    </time>
                  </div>
                  <p className="mt-2 max-w-[70ch] text-base font-medium leading-[1.7] text-[var(--color-text-body)]">
                    {notice.body}
                  </p>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      <div className="mx-auto grid w-[min(100%-40px,1240px)] items-start gap-10 pb-[72px] pt-12 lg:grid-cols-[1fr_460px] lg:gap-[72px] min-[1081px]:w-[min(100%-88px,1240px)]">
        <section aria-labelledby="mj-memo-title">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-[22px] font-extrabold tracking-[-0.032em]" id="mj-memo-title">
              하고 싶은 말
            </h2>
            <button
              className="mj-font-label min-h-[38px] whitespace-nowrap rounded-[var(--radius-control)] border border-[var(--color-border-control)] bg-[var(--color-surface-panel)] px-3.5 text-sm hover:border-[var(--color-primary-coral)] hover:text-[var(--color-primary-coral)]"
              onClick={toggleMemoEdit}
              type="button"
            >
              {memoEditing ? '저장' : '수정'}
            </button>
          </div>
          {memoEditing ? (
            <>
              <textarea
                aria-label="하고 싶은 말 메모"
                className="mj-font-body mt-4 min-h-28 w-full max-w-[56ch] resize-y rounded-[10px] border border-[var(--color-border-control)] bg-[var(--color-surface-panel)] p-[15px] text-lg leading-[1.7] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary-coral)] focus:outline-none focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]"
                maxLength={MEMO_MAX_LENGTH}
                onChange={(event) => setMemo(event.target.value)}
                placeholder="예: 첫 앨범부터 들었어요. 이번 곡 작업 이야기가 궁금해요."
                value={memo}
              />
              <div className="mt-2 flex max-w-[56ch] justify-between">
                <span className="text-sm font-semibold text-[var(--color-text-muted)]">
                  통화 화면에 함께 표시됩니다.
                </span>
                <span className="text-sm font-semibold tabular-nums text-[var(--color-text-muted)]">
                  {`${memo.length} / ${MEMO_MAX_LENGTH}자`}
                </span>
              </div>
            </>
          ) : (
            <p className="mt-4 max-w-[52ch] text-[19px] font-medium leading-[1.75] text-[var(--color-text-body)]">
              {memo.trim()
                ? `“${memo}”`
                : '아직 적지 않았어요. 미리 적어두면 통화 화면에 함께 보입니다.'}
            </p>
          )}
        </section>
        <section aria-labelledby="mj-notice-title">
          <h2 className="text-base font-extrabold tracking-[-0.025em]" id="mj-notice-title">
            대기 중 유의사항
          </h2>
          <ul className="mt-3 list-disc pl-[18px] text-base font-medium leading-[1.85] text-[var(--color-text-muted)]">
            <li>화면을 닫아도 5분 안에 다시 접속하면 순번이 유지됩니다.</li>
            <li>호출 후 30초 안에 입장하지 않으면 호출이 만료됩니다.</li>
            <li>연결이 끊기면 같은 순번으로 재연결을 시도합니다.</li>
          </ul>
        </section>
      </div>

      <Dialog
        description="사유를 남기면 운영자가 확인 후 순서를 뒤로 조정해 드려요."
        footer={
          <div className="flex justify-end gap-3">
            <Button
              disabled={isRequestingChange}
              onClick={() => setChangeDialogOpen(false)}
              variant="secondary"
            >
              닫기
            </Button>
            <Button
              disabled={!changeReason.trim() || isRequestingChange}
              loading={isRequestingChange}
              onClick={() => void handleChangeRequestSubmit()}
            >
              요청 보내기
            </Button>
          </div>
        }
        onOpenChange={setChangeDialogOpen}
        open={changeDialogOpen}
        title="순서 변경 요청"
      >
        <div className="grid gap-3">
          <Textarea
            label="요청 사유"
            maxLength={MAX_CHANGE_REASON_LENGTH}
            onChange={(event) => setChangeReason(event.target.value)}
            placeholder="예: 지금 통화가 어려워 순서를 뒤로 미루고 싶어요."
            rows={4}
            value={changeReason}
          />
          <p className="text-right text-xs text-[var(--color-text-secondary)]">
            {changeReason.length}/{MAX_CHANGE_REASON_LENGTH}자
          </p>
          {changeError ? (
            <AlertBanner title="요청 실패" variant="error">
              {changeError}
            </AlertBanner>
          ) : null}
        </div>
      </Dialog>
    </div>
  )
}
