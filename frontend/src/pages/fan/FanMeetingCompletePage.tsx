import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { getAuthSession } from '../../api/auth'
import {
    findMyRecordingByMeeting,
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
import { AlertBanner, Button, Card, CardContent } from '../../components'
// 카드 렌더링 코드는 이 화면에서만 쓰므로 공통 배럴을 거치지 않고 직접 가져온다.
import { FanCardSection } from '../../components/fanCard/FanCardSection'
import { RecordingVideo } from '../../components/media/RecordingVideo'
import { InvalidRouteState } from '../../components/routing/ScreenPage'

function formatDateTime(iso: string | null | undefined): string {
    if (!iso) return '-'
    const date = new Date(iso)

    if (Number.isNaN(date.getTime())) {
        return iso
    }

    const pad = (value: number) => String(value).padStart(2, '0')

    return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 바이트 크기를 사람이 읽기 쉬운 단위로 바꾼다. */
function formatFileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '-'
    const units = ['B', 'KB', 'MB', 'GB']
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)}${units[exponent]}`
}

/**
 * 기념 카드에 넣을 날짜 문구를 만든다.
 *
 * 통화 종료 시각을 알 수 없으면 카드를 만드는 날짜로 대체한다.
 */
function formatCardDate(iso: string | null | undefined): string {
    const parsed = iso ? new Date(iso) : new Date()
    const target = Number.isNaN(parsed.getTime()) ? new Date() : parsed
    const pad = (value: number) => String(value).padStart(2, '0')

    return `${target.getFullYear()}.${pad(target.getMonth() + 1)}.${pad(target.getDate())}`
}

/** 초 단위 재생 시간을 분:초 형식으로 바꾼다. */
function formatDuration(seconds: number | null): string {
    if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return '-'
    const minutes = Math.floor(seconds / 60)
    return `${minutes}분 ${String(Math.floor(seconds % 60)).padStart(2, '0')}초`
}

export function FanMeetingCompletePage() {
    const { fanMeetingId } = useParams()
    const location = useLocation()
    const routeState = location.state as {
        meetingTitle?: string
        pendingRecordingSessionId?: string
        /** 통화 화면이 넘겨 준 세션 식별자다. 기념 카드는 통화 세션 단위로 만든다. */
        callSessionId?: string
    } | null
    const [session] = useState(() => getAuthSession())
    const [recording, setRecording] = useState<RecordingSummaryResponse | null>(null)
    const [detail, setDetail] = useState<RecordingDetailResponse>()
    const [playbackUrl, setPlaybackUrl] = useState<string>()
    const [recordingEnabled, setRecordingEnabled] = useState<boolean>()
    const [influencerName, setInfluencerName] = useState<string>()
    const [detailTitle, setDetailTitle] = useState<string>()
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string>()
    const [downloading, setDownloading] = useState(false)
    const [downloadError, setDownloadError] = useState<string>()
    const [reloadKey, setReloadKey] = useState(0)
    const [pendingRecordingAvailable, setPendingRecordingAvailable] = useState(false)
    const [pendingRecordingSessionId, setPendingRecordingSessionId] = useState<string>()
    const [retryingPendingRecording, setRetryingPendingRecording] = useState(false)
    const [pendingRecordingError, setPendingRecordingError] = useState<string>()
    const serverEgressEnabled = import.meta.env.VITE_RECORDING_EGRESS_ENABLED === 'true'

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
                    setPendingRecordingError('브라우저에 보관된 녹화 영상을 확인하지 못했습니다.')
                }
            })

        return () => {
            active = false
        }
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
        setRecording(null)
        setDetail(undefined)
        setRecordingEnabled(undefined)
        setPlaybackUrl(undefined)

        Promise.all([
            // 첫 페이지에 없다는 이유로 녹화가 없다고 판단하지 않고 실제 목록의 모든 페이지를 확인한다.
            findMyRecordingByMeeting(
                fanMeetingId,
                session.accessToken,
                abortController.signal,
            ),
            fetchPublicFanMeetingDetail(
                Number(fanMeetingId),
                session.accessToken,
                abortController.signal,
            ).catch((error: unknown) => {
                if (abortController.signal.aborted) throw error
                // 녹화 목록은 독립 API이므로 상세 정책 조회 실패가 영상 조회까지 막지 않게 한다.
                return undefined
            }),
        ])
            .then(async ([matched, meeting]) => {
                setRecordingEnabled(meeting?.meeting.operation.recordingEnabled)
                // 기념 카드에 넣을 이름과 제목이라 녹화 유무와 무관하게 보관한다.
                setInfluencerName(meeting?.influencer.name)
                setDetailTitle(meeting?.meeting.title)
                setRecording(matched ?? null)
                if (!matched) return

                // 목록 요약만으로는 재생 가능 여부가 최신이 아닐 수 있어 상세로 한 번 더 확인한다.
                const loaded = await getRecordingDetail(
                    matched.recordingId,
                    session.accessToken,
                    abortController.signal,
                )
                if (abortController.signal.aborted) return
                setDetail(loaded)

                // 재생과 다운로드에 같은 서명 토큰을 쓰므로 준비되면 미리 한 번만 발급한다.
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
                        // 재생 링크 발급 실패가 녹화 상세와 다운로드 버튼까지 숨기지는 않게 한다.
                        setDownloadError(
                            error instanceof Error
                                ? `재생 링크를 준비하지 못했습니다: ${error.message}`
                                : '재생 링크를 준비하지 못했습니다.',
                        )
                    }
                }
            })
            .catch((error: unknown) => {
                if (error instanceof DOMException && error.name === 'AbortError') {
                    return
                }

                setLoadError(
                    error instanceof Error ? error.message : '녹화 정보를 불러오지 못했습니다.',
                )
            })
            .finally(() => {
                if (!abortController.signal.aborted) {
                    setLoading(false)
                }
            })

        return () => abortController.abort()
    }, [fanMeetingId, reloadKey, session])

    useEffect(() => {
        const processing = recording
            ? ['STARTING', 'RECORDING', 'PROCESSING'].includes(recording.status)
            : true
        if (!serverEgressEnabled || recordingEnabled !== true || !processing) return

        const timer = window.setInterval(() => {
            setReloadKey((key) => key + 1)
        }, 3_000)
        return () => window.clearInterval(timer)
    }, [recording, recordingEnabled, serverEgressEnabled])

    async function handlePendingRecordingRetry() {
        const pendingSessionId = pendingRecordingSessionId
        if (!pendingSessionId || !session) return

        setRetryingPendingRecording(true)
        setPendingRecordingError(undefined)
        try {
            const uploaded = await retryPendingRecordingUpload(
                pendingSessionId,
                session.accessToken,
            )
            if (!uploaded) {
                setPendingRecordingError('임시 보관된 녹화 파일을 찾을 수 없습니다.')
                return
            }
            setPendingRecordingAvailable(false)
            setReloadKey((key) => key + 1)
        } catch (error: unknown) {
            setPendingRecordingError(
                error instanceof Error ? error.message : '녹화 영상 재업로드에 실패했습니다.',
            )
        } finally {
            setRetryingPendingRecording(false)
        }
    }

    async function handleDownload() {
        if (!recording || !session) {
            return
        }

        setDownloading(true)
        setDownloadError(undefined)

        try {
            // 재생용으로 받아 둔 토큰이 있어도 다운로드 시점에 새로 발급해 만료를 피한다.
            const signedUrl = await issueRecordingDownloadUrl(
                recording.recordingId,
                session.accessToken,
            )
            const anchor = document.createElement('a')
            anchor.href = resolveRecordingContentUrl(signedUrl, true)
            anchor.download = detail?.fileName || recording.fileName || 'recording'
            anchor.rel = 'noopener'
            // 비동기 서명 발급 뒤에도 팝업 차단 영향을 받지 않도록 실제 링크 클릭으로 내려받는다.
            document.body.append(anchor)
            anchor.click()
            anchor.remove()
        } catch (error: unknown) {
            setDownloadError(
                error instanceof Error ? error.message : '다운로드 링크 발급에 실패했습니다.',
            )
        } finally {
            setDownloading(false)
        }
    }

    if (!fanMeetingId?.trim()) {
        return (
            <InvalidRouteState
                message="URL에 필요한 fanMeetingId 값이 없습니다."
                title="필수 URL 파라미터가 없습니다."
            />
        )
    }

    // 상세를 받았으면 상세의 playable을 우선하고, 아직이면 목록 요약값을 쓴다.
    const isRecordingReady = Boolean(detail?.playable ?? recording?.playable)
    const meetingTitle = recording?.meetingTitle
        ?? routeState?.meetingTitle
        ?? detailTitle
        ?? '팬미팅'
    const endedAt = recording?.completedAt

    // 통화가 끝나면 대기열 응답에서 callSessionId가 사라지므로 통화 화면이 넘겨 준 값을 우선 쓰고,
    // 새로고침 등으로 라우터 state가 없으면 녹화 정보에서 되찾는다.
    const fanCardSessionId = routeState?.callSessionId
        ?? (recording ? String(recording.callSessionId) : routeState?.pendingRecordingSessionId)

    let recordingTitle = '녹화 영상이 없습니다'
    let recordingDescription = recordingEnabled === false
        ? '이 팬미팅은 녹화하지 않도록 설정되어 있습니다.'
        : '이번 팬미팅의 녹화 영상이 아직 저장되지 않았습니다.'
    let recordingVariant: 'success' | 'info' | 'error' = 'info'

    if (!session) {
        recordingTitle = '로그인이 필요합니다'
        recordingDescription = '녹화 영상 정보를 확인하려면 로그인해 주세요.'
        recordingVariant = 'error'
    } else if (loading) {
        recordingTitle = '녹화 정보를 확인하고 있습니다'
        recordingDescription = '잠시만 기다려 주세요.'
    } else if (loadError) {
        recordingTitle = '녹화 정보를 불러오지 못했습니다'
        recordingDescription = loadError
        recordingVariant = 'error'
    } else if (isRecordingReady) {
        recordingTitle = '녹화 영상 저장이 완료되었습니다'
        recordingDescription = '아래에서 녹화 영상을 확인하고 다운로드할 수 있어요.'
        recordingVariant = 'success'
    } else if (recording?.status === 'FAILED') {
        recordingTitle = '녹화 영상을 저장하지 못했습니다'
        recordingDescription = recording.failureCode
            ? `통화는 정상 종료되었지만 서버 녹화에 실패했습니다. (${recording.failureCode})`
            : '통화는 정상 종료되었지만 서버 녹화에 실패했습니다.'
        recordingVariant = 'error'
    } else if (recording?.status === 'EXPIRED') {
        recordingTitle = '녹화 영상 보관 기간이 끝났습니다'
        recordingDescription = '보관 기간이 지나 더 이상 재생하거나 다운로드할 수 없습니다.'
    } else if (recording) {
        recordingTitle = '녹화 영상을 저장하고 있습니다'
        recordingDescription = '잠시만 기다려 주세요. 저장이 완료되면 이 화면에 표시됩니다.'
    }

    // 공통 App이 main 랜드마크를 제공하므로 완료 콘텐츠는 일반 컨테이너로 둔다.
    return (
        <div className="mx-auto w-full max-w-5xl">
            <Card>
                <CardContent className="p-6 sm:p-10 lg:p-14">
                    <section className="border-b border-[var(--color-divider)] pb-10 text-center">
                        <div
                            aria-hidden="true"
                            className="mx-auto flex size-14 items-center justify-center rounded-[var(--radius-panel)] bg-[var(--color-success-soft)] text-2xl font-bold text-[var(--color-success)]"
                        >
                            ✓
                        </div>
                        <h1 className="mt-6 text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">
                            팬미팅이 종료되었습니다
                        </h1>
                        <p className="mt-3 text-[var(--color-text-secondary)]">
                            소중한 시간을 함께해 주셔서 감사합니다.
                        </p>
                    </section>
                    <section
                        aria-live="polite"
                        className="pt-8"
                    >
                        <AlertBanner
                            title={recordingTitle}
                            variant={recordingVariant}
                        >
                            <p>{recordingDescription}</p>
                            {loadError ? (
                                <Button
                                    className="mt-3"
                                    onClick={() => setReloadKey((key) => key + 1)}
                                    size="sm"
                                    variant="secondary"
                                >
                                    녹화 정보 다시 불러오기
                                </Button>
                            ) : null}
                        </AlertBanner>
                    </section>
                    {pendingRecordingAvailable || pendingRecordingError ? (
                        <section aria-live="polite" className="pt-4">
                            <AlertBanner
                                title="브라우저에 보관된 녹화 영상이 있습니다"
                                variant={pendingRecordingError ? 'error' : 'warning'}
                            >
                                <p>
                                    {pendingRecordingError
                                        ?? '통화 화면에서 업로드하지 못한 영상을 서버에 다시 저장해 주세요.'}
                                </p>
                                {pendingRecordingAvailable ? (
                                    <Button
                                        className="mt-3"
                                        loading={retryingPendingRecording}
                                        onClick={() => void handlePendingRecordingRetry()}
                                        size="sm"
                                        variant="secondary"
                                    >
                                        녹화 영상 다시 업로드
                                    </Button>
                                ) : null}
                            </AlertBanner>
                        </section>
                    ) : null}
                    {isRecordingReady && recording && (
                        <section className="mt-8 grid gap-6 lg:grid-cols-2">
                            <Card className="p-6">
                                <div className="min-w-0">
                                    {playbackUrl ? (
                                        <RecordingVideo
                                            className="aspect-video w-full rounded-[var(--radius-panel)] bg-black"
                                            controls
                                            controlsList="nodownload"
                                            preload="metadata"
                                            src={playbackUrl}
                                        >
                                            브라우저가 영상 재생을 지원하지 않습니다. 아래 다운로드 버튼을 이용해 주세요.
                                        </RecordingVideo>
                                    ) : (
                                        <div className="flex aspect-video items-center justify-center rounded-[var(--radius-panel)] bg-[var(--color-divider)] text-[var(--color-text-secondary)]">
                                            재생 링크를 준비하고 있습니다
                                        </div>
                                    )}
                                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <strong className="text-[var(--color-text-primary)]">
                                            {meetingTitle}
                                        </strong>

                                        {endedAt ? (
                                            <time className="text-sm text-[var(--color-text-secondary)]"
                                                dateTime={endedAt}
                                            >
                                                {formatDateTime(endedAt)}
                                            </time>
                                        ) : null}
                                    </div>
                                    {detail ? (
                                        <dl className="mt-4 grid gap-2 border-t border-[var(--color-divider)] pt-4 text-sm">
                                            <div className="flex justify-between">
                                                <dt className="text-[var(--color-text-secondary)]">재생 시간</dt>
                                                <dd className="font-semibold">{formatDuration(detail.durationSec)}</dd>
                                            </div>
                                            <div className="flex justify-between">
                                                <dt className="text-[var(--color-text-secondary)]">파일 크기</dt>
                                                <dd className="font-semibold">
                                                    {detail.fileSizeBytes === null
                                                        ? '처리 중'
                                                        : formatFileSize(detail.fileSizeBytes)}
                                                </dd>
                                            </div>
                                            <div className="flex justify-between">
                                                <dt className="text-[var(--color-text-secondary)]">파일명</dt>
                                                <dd className="min-w-0 truncate pl-4 font-semibold">{detail.fileName}</dd>
                                            </div>
                                        </dl>
                                    ) : null}
                                </div>
                            </Card>

                            <div className="flex flex-col gap-4">
                                <div className="rounded-[var(--radius-panel)] bg-[var(--color-surface-page)] p-6">
                                    <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
                                        다운로드 유의사항
                                    </h2>
                                    <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                                        영상은 마이페이지의 팬미팅 히스토리에서{' '}
                                        {formatDateTime(recording.availableUntil)}까지 유지됩니다.
                                        기간 안에 필요한 영상을 다운로드해 주세요.
                                    </p>
                                </div>

                                {downloadError ? (
                                    <AlertBanner title="다운로드에 실패했습니다" variant="error">
                                        {downloadError}
                                    </AlertBanner>
                                ) : null}

                                <div className="mt-auto grid gap-3">
                                    <Button
                                        className="w-full"
                                        loading={downloading}
                                        onClick={() => void handleDownload()}
                                        size="lg"
                                    >
                                        녹화 영상 다운로드
                                    </Button>
                                    <Link
                                        className="inline-flex min-h-[var(--control-height-final-cta)] items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border-control)] bg-[var(--color-surface-panel)] px-6 py-2.5 font-semibold text-[var(--color-text-primary)] transition-colors duration-200 hover:bg-[var(--color-surface-page)] active:bg-[var(--color-divider)] motion-reduce:transition-none"
                                        to="/fan/mypage/fan-meetings?status=completed"
                                    >
                                        마이페이지로 이동
                                    </Link>
                                </div>
                            </div>
                        </section>
                    )}
                    {/* 기념 카드는 녹화와 무관하므로 녹화가 없거나 실패해도 제공한다. */}
                    {session && fanCardSessionId ? (
                        <FanCardSection
                            authToken={session.accessToken}
                            callSessionId={fanCardSessionId}
                            dateLabel={formatCardDate(endedAt)}
                            fanNickname={session.nickname}
                            influencerName={influencerName ?? '인플루언서'}
                            meetingTitle={meetingTitle}
                        />
                    ) : null}
                </CardContent>
            </Card>
        </div>
    )
}
