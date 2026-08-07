import { useEffect, useMemo, useState } from 'react'
import { parseServerDate } from '../../api/serverTime'
import { Link, useLocation, useParams } from 'react-router-dom'
import moldEmptyImage from '../../assets/jelly-mold-empty.png'
import { getAuthSession } from '../../api/auth'
import { getMyApplication } from '../../api/applications'
import {
  getAllMyRecordings,
  getRecordingDetail,
  issueRecordingDownloadUrl,
  resolveRecordingContentUrl,
  retryPendingRecordingUpload,
  type RecordingDetailResponse,
  type RecordingSummaryResponse,
} from '../../api/recordings'
import {
  findPendingRecordingByMeeting,
  getPendingRecording,
} from '../../api/pendingRecordings'
import { fetchPublicFanMeetingDetail } from '../../api/fanMeetings'
import { AlertBanner, Button, Spinner } from '../../components'
import { RecordingVideo } from '../../components/media/RecordingVideo'
import { InvalidRouteState } from '../../components/routing/ScreenPage'
import { useTranslation, type TranslationKey } from '../../i18n'

const DAY_MS = 24 * 60 * 60 * 1000

function pad(value: number) {
  return String(value).padStart(2, '0')
}

/** 2026.08.02 */
function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  const date = parseServerDate(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`
}

/** 01:52 — 함께한 시간·기록 카드의 통화 길이 표기다. */
function formatClock(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return '--:--'
  }
  return `${pad(Math.floor(seconds / 60))}:${pad(Math.floor(seconds % 60))}`
}

/**
 * 1분 52초 — 제목 문장에 쓰는 표기다.
 *
 * 모듈 함수라 훅을 쓸 수 없어 번역 함수를 인자로 받는다.
 */
function formatSpokenDuration(
  seconds: number | null | undefined,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string | undefined {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return undefined
  }
  const minutes = Math.floor(seconds / 60)
  const rest = Math.floor(seconds % 60)
  if (minutes === 0) return t('done.duration.seconds', { seconds: rest })
  return rest > 0
    ? t('done.duration.minutesSeconds', { minutes, seconds: rest })
    : t('done.duration.minutes', { minutes })
}

/**
 * 영상 보관 만료까지 남은 일수다. 지났으면 0을 준다.
 *
 * 백엔드는 녹화가 아직 완료되지 않았거나(요청·egress 진행 중) 실패한 경우 `availableUntil`을
 * 내려주지 않는다. 그때 0일을 반환하면 "곧 삭제됨"이라는 잘못된 정보가 되므로,
 * **모르는 상태는 null로 구분해** 호출하는 쪽이 표기를 생략할 수 있게 한다.
 */
function remainingDays(availableUntil: string | null | undefined): number | null {
  if (!availableUntil) return null

  const until = parseServerDate(availableUntil).getTime()
  if (Number.isNaN(until)) return null

  return Math.max(0, Math.ceil((until - Date.now()) / DAY_MS))
}

/**
 * 기록 정렬용 시각(ms)이다. 값이 없거나 해석할 수 없으면 0을 준다.
 *
 * `completedAt`은 녹화가 완료된 뒤에만 채워지므로, 아직 완료되지 않은 기록은 시각을 알 수 없다.
 * 0을 주어 목록 끝으로 밀어 두면 완료된 기록의 최신순 정렬이 흔들리지 않는다.
 */
function completedTime(completedAt: string | null | undefined): number {
  if (!completedAt) return 0

  const time = parseServerDate(completedAt).getTime()
  return Number.isNaN(time) ? 0 : time
}

/** 대기실에서 저장한 "하고 싶은 말"을 읽는다. 팬 측 메모 API가 아직 없어 브라우저 보관값을 쓴다. */
function readFanNote(meetingId: string | number): string {
  try {
    return window.sessionStorage.getItem(`melly-fan-note:${meetingId}`)?.trim() ?? ''
  } catch {
    return ''
  }
}

/** MELLY 씰 — 기록물 썸네일에만 허용된 젤리 표현이다. 영상이 만료된 기록은 흐려진다. */
function MellySeal({ dimmed, size }: { dimmed: boolean; size: 'lg' | 'sm' }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute grid place-items-center rounded-full font-black tracking-[-0.05em] text-white ${
        size === 'lg'
          ? 'left-5 top-5 size-[30px] text-sm shadow-[0_2px_12px_rgb(23_24_29/28%)]'
          : 'left-[11px] top-[11px] size-[22px] text-[11px]'
      } ${dimmed ? 'bg-[var(--color-primary-coral)]/70' : 'bg-[var(--color-primary-coral)]'}`}
    >
      M
    </span>
  )
}

export function FanMeetingCompletePage() {
  const { t } = useTranslation()
  const { fanMeetingId } = useParams()
  const location = useLocation()
  const routeState = location.state as {
    meetingTitle?: string
    pendingRecordingSessionId?: string
    /** 통화 화면이 넘겨 준 세션 식별자다. 기념 카드는 통화 세션 단위로 만든다. */
    callSessionId?: string
  } | null
  const [session] = useState(() => getAuthSession())
  const [recordings, setRecordings] = useState<RecordingSummaryResponse[]>()
  const [detail, setDetail] = useState<RecordingDetailResponse>()
  const [playbackUrl, setPlaybackUrl] = useState<string>()
  const [recordingEnabled, setRecordingEnabled] = useState<boolean>()
  const [influencerName, setInfluencerName] = useState<string>()
  const [callOrder, setCallOrder] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string>()
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string>()
  const [reloadKey, setReloadKey] = useState(0)
  const [pendingRecordingAvailable, setPendingRecordingAvailable] = useState(false)
  const [pendingRecordingSessionId, setPendingRecordingSessionId] = useState<string>()
  const [retryingPendingRecording, setRetryingPendingRecording] = useState(false)
  const [pendingRecordingError, setPendingRecordingError] = useState<string>()

  useEffect(() => {
    let active = true
    const pendingSessionId = routeState?.pendingRecordingSessionId
    const pendingRequest = pendingSessionId
      ? getPendingRecording(pendingSessionId)
      : fanMeetingId
        ? findPendingRecordingByMeeting(fanMeetingId)
        : Promise.resolve(undefined)

    void pendingRequest
      .then((pending) => {
        if (!active) return
        setPendingRecordingAvailable(Boolean(pending))
        setPendingRecordingSessionId(pending?.callSessionId)
      })
      .catch(() => {
        if (active) {
          setPendingRecordingError(t('done.pending.checkFailed'))
        }
      })

    return () => {
      active = false
    }
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fanMeetingId, routeState?.pendingRecordingSessionId])

  useEffect(() => {
    if (!fanMeetingId?.trim() || !session) {
      setLoading(false)
      return
    }

    const abortController = new AbortController()
    setLoading(true)
    setLoadError(undefined)
    setDownloadError(undefined)
    setRecordings(undefined)
    setDetail(undefined)
    setRecordingEnabled(undefined)
    setPlaybackUrl(undefined)

    // 기록 목록(아카이브)과 이번 팬미팅의 녹화를 한 번의 전체 조회로 함께 얻는다.
    Promise.all([
      getAllMyRecordings(session.accessToken, abortController.signal),
      fetchPublicFanMeetingDetail(
        Number(fanMeetingId),
        session.accessToken,
        abortController.signal,
      ).catch(() => undefined),
      // 내 순번은 응모 응답에만 있으며, 없어도 화면 표시는 막지 않는다.
      getMyApplication(fanMeetingId, session.accessToken, abortController.signal).catch(
        () => null,
      ),
    ])
      .then(async ([allRecordings, meeting, application]) => {
        setRecordings(allRecordings)
        setRecordingEnabled(meeting?.meeting.operation.recordingEnabled)
        setInfluencerName(meeting?.influencer.name)
        setCallOrder(application?.callOrder ?? null)

        const matched = allRecordings.find(
          (item) => String(item.meetingId) === String(fanMeetingId),
        )
        if (!matched) return

        // 목록 요약만으로는 재생 가능 여부가 최신이 아닐 수 있어 상세로 한 번 더 확인한다.
        const loaded = await getRecordingDetail(
          matched.recordingId,
          session.accessToken,
          abortController.signal,
        )
        if (abortController.signal.aborted) return
        setDetail(loaded)

        if (loaded.playable) {
          try {
            const signedUrl = await issueRecordingDownloadUrl(
              matched.recordingId,
              session.accessToken,
              abortController.signal,
            )
            if (abortController.signal.aborted) return
            setPlaybackUrl(resolveRecordingContentUrl(signedUrl))
          } catch (error: unknown) {
            if (abortController.signal.aborted) return
            // 재생 링크 발급 실패가 녹화 정보와 다운로드 버튼까지 숨기지는 않게 한다.
            setDownloadError(
              error instanceof Error
                ? t('done.error.playbackLinkWithReason', { reason: error.message })
                : t('done.error.playbackLink'),
            )
          }
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLoadError(
          error instanceof Error ? error.message : t('done.error.recordingLoad'),
        )
      })
      .finally(() => {
        if (!abortController.signal.aborted) setLoading(false)
      })

    return () => abortController.abort()
    // 위와 같은 이유로 t는 제외한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fanMeetingId, reloadKey, session])

  const memo = useMemo(
    () => (fanMeetingId ? readFanNote(fanMeetingId) : ''),
    [fanMeetingId],
  )

  async function handlePendingRecordingRetry() {
    const pendingSessionId = pendingRecordingSessionId
    if (!pendingSessionId || !session) return

    setRetryingPendingRecording(true)
    setPendingRecordingError(undefined)
    try {
      const uploaded = await retryPendingRecordingUpload(pendingSessionId, session.accessToken)
      if (!uploaded) {
        setPendingRecordingError(t('done.pending.notFound'))
        return
      }
      setPendingRecordingAvailable(false)
      setReloadKey((key) => key + 1)
    } catch (error: unknown) {
      setPendingRecordingError(
        error instanceof Error ? error.message : t('done.pending.retryFailed'),
      )
    } finally {
      setRetryingPendingRecording(false)
    }
  }

  const currentRecording = recordings?.find(
    (item) => String(item.meetingId) === String(fanMeetingId),
  )

  async function handleDownload() {
    if (!currentRecording || !session) return

    setDownloading(true)
    setDownloadError(undefined)

    try {
      // 재생용으로 받아 둔 토큰이 있어도 다운로드 시점에 새로 발급해 만료를 피한다.
      const signedUrl = await issueRecordingDownloadUrl(
        currentRecording.recordingId,
        session.accessToken,
      )
      const anchor = document.createElement('a')
      anchor.href = resolveRecordingContentUrl(signedUrl, true)
      anchor.download = detail?.fileName || currentRecording.fileName || 'recording'
      anchor.rel = 'noopener'
      // 비동기 서명 발급 뒤에도 팝업 차단 영향을 받지 않도록 실제 링크 클릭으로 내려받는다.
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
    } catch (error: unknown) {
      setDownloadError(
        error instanceof Error ? error.message : t('done.error.downloadLink'),
      )
    } finally {
      setDownloading(false)
    }
  }

  if (!fanMeetingId?.trim()) {
    return (
      <InvalidRouteState
        message={t('done.invalid.message')}
        title={t('done.invalid.title')}
      />
    )
  }

  const isReady = Boolean((detail?.playable ?? currentRecording?.playable) && !loading)
  const isExpired = currentRecording?.status === 'EXPIRED'
  const noRecordingMeeting = recordingEnabled === false && !currentRecording
  // dc.html의 두 단계 — 처리 중(proc) / 완료(done). 만료·녹화 없음은 실제 상태에 맞춰 변형한다.
  const proc = loading || (Boolean(currentRecording) && !isReady && !isExpired)
  const durationSec = detail?.durationSec ?? currentRecording?.durationSec ?? null
  const spokenDuration = formatSpokenDuration(durationSec, t)
  // 보관 기한을 모르는 경우(녹화 미완료·실패)도 null이 되어 아래 recMeta에서 표기를 생략한다.
  const daysLeft = remainingDays(currentRecording?.availableUntil)

  const headline = proc
    ? t('done.headline.processing')
    : influencerName && spokenDuration
      ? t('done.headline.withDuration', { influencer: influencerName, duration: spokenDuration })
      : t('done.headline.default')
  const subline = proc
    ? t('done.subline.processing')
    : noRecordingMeeting
      ? t('done.subline.noRecording')
      : t('done.subline.saved')

  const recTitle = proc
    ? t('done.rec.saving')
    : isExpired
      ? t('done.rec.expired')
      : noRecordingMeeting
        ? t('done.rec.noRecording')
        : t('done.rec.saved')
  const recMeta = proc
    ? t('done.recMeta.processing')
    : isExpired
      ? t('done.recMeta.expired')
      : noRecordingMeeting
        ? ''
        : daysLeft !== null
          ? t('done.recMeta.daysLeft', { days: daysLeft })
          : ''
  const downloadDisabled = proc || isExpired || noRecordingMeeting || downloading
  const downloadLabel = proc
    ? t('done.download.saving')
    : isExpired
      ? t('done.download.expired')
      : noRecordingMeeting
        ? t('done.download.none')
        : t('done.download.ready')

  const eyebrowDate = formatDate(
    currentRecording?.completedAt ?? new Date().toISOString(),
  )
  // 통화가 끝나면 대기열 응답에서 callSessionId가 사라지므로 통화 화면이 넘겨 준 값을 우선 쓰고,
  // 새로고침 등으로 라우터 state가 없으면 녹화 정보에서 되찾는다.
  const fanCardSessionId = routeState?.callSessionId
    ?? (currentRecording
      ? String(currentRecording.callSessionId)
      : routeState?.pendingRecordingSessionId)
  // 완료 시각 최신순이다. 완료되지 않아 시각을 모르는 기록은 completedTime이 0을 주어 뒤로 밀린다.
  const archive = [...(recordings ?? [])].sort(
    (left, right) => completedTime(right.completedAt) - completedTime(left.completedAt),
  )

  return (
    <div className="-mx-4 -mt-8 sm:-mx-6 lg:-mx-10 lg:-mt-10">
      <section
        aria-label={t('done.sectionAria')}
        className="grid items-stretch border-b border-[var(--color-divider)] min-[1081px]:grid-cols-[minmax(0,1fr)_504px]"
      >
        <div className="relative min-h-[min(52vw,420px)] overflow-hidden bg-[var(--color-surface-muted)] min-[1081px]:min-h-[560px]">
          {!proc && playbackUrl ? (
            <>
              {/* 통화 기록 영상이 그대로 이 기록의 사진 자리에 안착한다. (S3 Signature) */}
              <RecordingVideo
                className="absolute inset-0 size-full bg-black object-cover motion-safe:animate-[mj-settle-in_560ms_cubic-bezier(0.16,1,0.3,1)_both]"
                controls
                controlsList="nodownload"
                preload="metadata"
                src={playbackUrl}
              >
                {t('done.videoFallback')}
              </RecordingVideo>
              <span
                aria-hidden="true"
                className="mj-seam-glow pointer-events-none absolute inset-y-0 right-0 hidden w-[88px] min-[1081px]:block"
                style={{
                  opacity: 0.62,
                  background:
                    'linear-gradient(90deg, rgba(232,97,92,0) 0%, rgba(232,97,92,0.16) 62%, rgba(217,66,63,0.34) 100%)',
                }}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 hidden w-[3px] min-[1081px]:block"
                style={{
                  opacity: 0.9,
                  background:
                    'linear-gradient(180deg, rgba(232,97,92,0.25) 0%, rgba(217,66,63,0.95) 42%, rgba(232,97,92,0.35) 100%)',
                }}
              />
              <MellySeal dimmed={false} size="lg" />
            </>
          ) : (
            /*
              영상이 없을 때의 자리다. 이전에는 아무것도 그리지 않아 통화 종료 직후 이 화면에서
              560px 높이의 빈 회색 면만 마주하게 됐다. 통화를 마치고 처음 보는 화면이므로
              지금 무슨 일이 일어나는지(저장 중·녹화 없음·보관 종료)를 상태에 맞게 알려 준다.
            */
            <div className="absolute inset-0 grid place-items-center px-8 text-center">
              <div className="grid justify-items-center gap-4">
                {proc ? (
                  <>
                    {/* 저장이 진행 중임을 움직임으로 알린다. 정지된 안내문만으로는 멈춘 것처럼 보인다. */}
                    <Spinner label={t('done.placeholder.savingLabel')} size="lg" />
                    <div>
                      <strong className="text-[19px] font-extrabold tracking-[-0.03em]">
                        {t('done.placeholder.savingTitle')}
                      </strong>
                      <p className="mt-2 max-w-[34ch] text-base font-medium leading-[1.65] text-[var(--color-text-muted)]">
                        {t('done.placeholder.savingDesc')}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <img
                      alt=""
                      className="size-[104px] object-contain opacity-60"
                      src={moldEmptyImage}
                    />
                    <div>
                      <strong className="text-[19px] font-extrabold tracking-[-0.03em]">
                        {isExpired
                          ? t('done.placeholder.expiredTitle')
                          : noRecordingMeeting
                            ? t('done.placeholder.noRecordingTitle')
                            : t('done.placeholder.missingTitle')}
                      </strong>
                      <p className="mt-2 max-w-[34ch] text-base font-medium leading-[1.65] text-[var(--color-text-muted)]">
                        {isExpired
                          ? t('done.placeholder.expiredDesc')
                          : noRecordingMeeting
                            ? t('done.placeholder.noRecordingDesc')
                            : t('done.placeholder.missingDesc')}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 통화 직후 도착하는 감정적 화면이라, 제목 → 함께한 시간 → 녹화 순으로 차례로 자리 잡는다. */}
        <div className="flex flex-col px-5 pb-8 pt-[26px] sm:px-[26px] sm:pb-9 sm:pt-[30px] min-[1081px]:pb-11 min-[1081px]:pl-10 min-[1081px]:pr-11 min-[1081px]:pt-[46px]">
          <p className="text-sm font-bold text-[var(--color-text-muted)] motion-safe:animate-[mj-settle-in_480ms_cubic-bezier(0.16,1,0.3,1)_both]">
            {callOrder !== null
              ? t('done.eyebrowWithOrder', { date: eyebrowDate, order: callOrder })
              : eyebrowDate}
          </p>
          <h1 className="mt-3.5 text-[clamp(28px,2.9vw,38px)] font-black leading-[1.15] tracking-[-0.048em] [text-wrap:balance] motion-safe:animate-[mj-settle-in_480ms_cubic-bezier(0.16,1,0.3,1)_90ms_both]">
            {headline}
          </h1>
          <p className="mt-4 text-[17px] font-medium leading-[1.7] text-[var(--color-text-body)] motion-safe:animate-[mj-settle-in_480ms_cubic-bezier(0.16,1,0.3,1)_170ms_both]">
            {subline}
          </p>

          <div className="mt-[30px] border-t border-[var(--color-divider)] pt-6 motion-safe:animate-[mj-settle-in_480ms_cubic-bezier(0.16,1,0.3,1)_280ms_both]">
            <p className="text-sm font-bold text-[var(--color-text-muted)]">{t('done.sharedTime')}</p>
            <p className="mt-1.5 text-[40px] font-black leading-none tracking-[-0.045em] tabular-nums">
              {formatClock(durationSec)}
            </p>
          </div>

          <div className="mt-[26px] border-t border-[var(--color-divider)] pt-[22px] motion-safe:animate-[mj-settle-in_480ms_cubic-bezier(0.16,1,0.3,1)_390ms_both]">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-[17px] font-extrabold tracking-[-0.03em]">{recTitle}</h2>
              {recMeta ? (
                <span
                  className={`whitespace-nowrap text-sm font-bold ${proc || isExpired ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-warning)]'}`}
                >
                  {recMeta}
                </span>
              ) : null}
            </div>
            {noRecordingMeeting ? null : (
              <p className="mt-2.5 text-base font-medium leading-[1.7] text-[var(--color-text-body)]">
                <strong className="font-extrabold text-[var(--color-text-primary)]">
                  {t('done.retention.strong')}
                </strong>{' '}
                {t('done.retention.rest')}
              </p>
            )}
            <button
              className={`mj-font-emphasis mt-5 min-h-14 w-full rounded-[10px] border text-[17px] transition-colors ${
                downloadDisabled
                  ? 'cursor-not-allowed border-[var(--color-border-control)] bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]'
                  : 'border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] text-white shadow-[var(--shadow-final-cta)] hover:bg-[var(--color-primary-coral-hover)]'
              }`}
              disabled={downloadDisabled}
              onClick={() => void handleDownload()}
              type="button"
            >
              {downloading ? t('done.download.preparing') : downloadLabel}
            </button>
            <Link
              className="mj-font-label mt-1.5 flex min-h-11 w-full items-center justify-center text-[15px] text-[var(--color-text-muted)] hover:text-[var(--color-primary-coral)]"
              to="/fan/mypage/fan-meetings?status=completed"
            >
              {t('done.viewAll')}
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto w-[min(100%-40px,1240px)] pt-12 min-[1081px]:w-[min(100%-88px,1240px)]">
        {loadError ? (
          <AlertBanner className="mb-8" title={t('done.error.recordingTitle')} variant="error">
            <p>{loadError}</p>
            <Button
              className="mt-3"
              onClick={() => setReloadKey((key) => key + 1)}
              size="sm"
              variant="secondary"
            >
              {t('done.error.reload')}
            </Button>
          </AlertBanner>
        ) : null}
        {pendingRecordingAvailable || pendingRecordingError ? (
          <AlertBanner
            className="mb-8"
            title={t('done.pending.title')}
            variant={pendingRecordingError ? 'error' : 'warning'}
          >
            <p>
              {pendingRecordingError
                ?? t('done.pending.description')}
            </p>
            {pendingRecordingAvailable ? (
              <Button
                className="mt-3"
                loading={retryingPendingRecording}
                onClick={() => void handlePendingRecordingRetry()}
                size="sm"
                variant="secondary"
              >
                {t('done.pending.retry')}
              </Button>
            ) : null}
          </AlertBanner>
        ) : null}
        {downloadError ? (
          <AlertBanner className="mb-8" title={t('done.error.downloadTitle')} variant="error">
            {downloadError}
          </AlertBanner>
        ) : null}

        <section aria-labelledby="mj-said-title" className="max-w-[56ch]">
          <h2 className="text-base font-extrabold tracking-[-0.025em]" id="mj-said-title">
            {t('done.myNote')}
          </h2>
          <p className="mt-3.5 text-[22px] font-medium leading-[1.7]">
            {memo ? `“${memo}”` : t('done.myNote.empty')}
          </p>
        </section>

        {/*
          기념 카드는 녹화와 무관하므로 녹화가 없거나 실패해도 제공한다.
          만들기 화면은 스티커를 끌어 옮길 자리가 필요해 따로 두고, 여기서는 들어가는
          입구만 보여 준다.
        */}
        {session && fanCardSessionId ? (
          <section className="mt-10 rounded-[var(--radius-panel)] border border-[var(--color-divider)] p-6">
            <h2 className="text-base font-extrabold tracking-[-0.025em]">{t('fanCard.entry.title')}</h2>
            <p className="mt-2 text-[15px] font-medium leading-[1.6] text-[var(--color-text-muted)]">
              {t('fanCard.entry.description')}
            </p>
            <Link
              className="mj-font-label mt-4 inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-primary-coral)] px-5 text-[15px] font-bold text-white hover:opacity-90"
              to={`/fan/fan-meetings/${fanMeetingId}/cards/${fanCardSessionId}`}
            >
              {t('fanCard.entry.action')}
            </Link>
          </section>
        ) : null}
      </div>

      <div className="mx-auto w-[min(100%-40px,1240px)] pb-[72px] min-[1081px]:w-[min(100%-88px,1240px)]">
        <section
          aria-labelledby="mj-arch-title"
          className="mt-14 border-t border-[var(--color-divider)] pt-7"
        >
          <div className="flex items-baseline justify-between gap-6">
            <h2 className="text-[22px] font-black tracking-[-0.032em]" id="mj-arch-title">
              {t('done.archive.title')}
            </h2>
            <span className="text-[15px] font-semibold text-[var(--color-text-muted)]">
              {t('done.archive.count', { count: archive.length })}
            </span>
          </div>

          {archive.length === 0 ? (
            <div className="mt-6 grid place-items-center px-6 py-16 text-center">
              <img alt="" className="size-[104px] object-contain opacity-60" src={moldEmptyImage} />
              <strong className="mt-4 text-[19px] font-extrabold tracking-[-0.03em]">
                {t('done.archive.emptyTitle')}
              </strong>
              <span className="mt-2 max-w-[400px] text-base font-medium leading-[1.6] text-[var(--color-text-muted)]">
                {t('done.archive.emptyDesc')}
              </span>
              <Link
                className="mj-font-emphasis mt-5 inline-flex min-h-12 items-center rounded-[10px] bg-[var(--color-primary-coral)] px-[22px] text-base text-white transition-colors hover:bg-[var(--color-primary-coral-hover)]"
                to="/fan/events"
              >
                {t('done.archive.browse')}
              </Link>
            </div>
          ) : (
            <>
              <div className="mt-[26px] grid grid-cols-1 gap-[30px] sm:grid-cols-2 lg:grid-cols-3">
                {archive.map((item, index) => {
                  const isLatest = index === 0
                  const expired = item.status === 'EXPIRED' || !item.playable
                  const note = readFanNote(item.meetingId)
                  const days = remainingDays(item.availableUntil)

                  return (
                    <article key={item.recordingId}>
                      <figure className="relative m-0 overflow-hidden rounded-[10px] bg-[var(--color-surface-muted)]">
                        <div
                          aria-label={t('done.archive.noPhotoAria')}
                          className="grid aspect-[16/10] w-full place-items-center bg-[var(--color-surface-page)]"
                          role="img"
                        >
                          <span className="text-sm font-semibold text-[var(--color-text-muted)]">
                            {t('done.archive.noPhoto')}
                          </span>
                        </div>
                        {isLatest ? (
                          <span
                            aria-hidden="true"
                            className="absolute inset-y-0 right-0 w-[2px]"
                            style={{
                              background:
                                'linear-gradient(180deg, rgba(232,97,92,0.2) 0%, rgba(217,66,63,0.9) 46%, rgba(232,97,92,0.3) 100%)',
                            }}
                          />
                        ) : null}
                        <MellySeal dimmed={!isLatest} size="sm" />
                      </figure>
                      <h3 className="mt-[15px] text-lg font-extrabold tracking-[-0.03em]">
                        {item.meetingTitle}
                      </h3>
                      <p className="mt-1.5 text-[15px] font-medium tabular-nums text-[var(--color-text-muted)]">
                        {formatDate(item.completedAt)} · {formatClock(item.durationSec)}
                      </p>
                      <p
                        className={`mt-2.5 text-[15px] font-medium leading-[1.65] ${note ? 'text-[var(--color-text-body)]' : 'text-[var(--color-text-muted)]'}`}
                      >
                        {note ? `“${note}”` : t('done.archive.noteEmpty')}
                      </p>
                      <p
                        className={`mt-3 border-t border-[var(--color-divider)] pt-3 text-sm font-bold ${expired ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-warning)]'}`}
                      >
                        {/* days가 null이면 보관 기한이 아직 정해지지 않은 것이라 남은 일수를 단정하지 않는다. */}
                        {expired
                          ? t('done.archive.videoExpired')
                          : days === null
                            ? t('done.archive.videoProcessing')
                            : t('done.archive.videoDaysLeft', { days })}{' '}
                        <span className="font-medium text-[var(--color-text-muted)]">
                          {note || !expired
                            ? t('done.archive.keepPhoto')
                            : t('done.archive.recordOnly')}
                        </span>
                      </p>
                    </article>
                  )
                })}
              </div>

              <p className="mt-[34px] border-t border-[var(--color-divider)] pt-[22px] text-base font-medium text-[var(--color-text-muted)]">
                {t('done.archive.next')}{' '}
                <Link className="font-bold text-[var(--color-primary-coral)]" to="/fan/events">
                  {t('done.archive.browse')}
                </Link>
              </p>
            </>
          )}
        </section>

        {/*
          기념 카드는 녹화와 무관하므로 녹화가 없거나 실패해도 제공한다.
          만들기 화면은 스티커를 끌어 옮길 자리가 필요해 따로 두고, 여기서는 들어가는
          입구만 보여 준다.
        */}
        {session && routeState?.callSessionId ? (
          <section className="mt-10 rounded-[var(--radius-panel)] border border-[var(--color-divider)] p-6">
            <h2 className="text-base font-extrabold tracking-[-0.025em]">
              {t('fanCard.entry.title')}
            </h2>
            <p className="mt-2 text-[15px] font-medium leading-[1.6] text-[var(--color-text-muted)]">
              {t('fanCard.entry.description')}
            </p>
            <Link
              className="mj-font-label mt-4 inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-primary-coral)] px-5 text-[15px] font-bold text-white transition-colors hover:bg-[var(--color-primary-coral-hover)]"
              to={`/fan/fan-meetings/${fanMeetingId}/cards/${routeState.callSessionId}`}
            >
              {t('fanCard.entry.action')}
            </Link>
          </section>
        ) : null}
      </div>
    </div>
  )
}
