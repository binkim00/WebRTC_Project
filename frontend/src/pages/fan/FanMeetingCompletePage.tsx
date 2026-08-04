import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { getAuthSession } from '../../api/auth'
import {
    buildRecordingContentUrl,
    getMyRecordings,
    getRecordingDetail,
    issueRecordingDownloadUrl,
    type RecordingDetailResponse,
    type RecordingSummaryResponse,
} from '../../api/recordings'
import { AlertBanner, Button, Card, CardContent } from '../../components'
import { InvalidRouteState } from '../../components/routing/ScreenPage'

function formatDateTime(iso: string): string {
    const date = new Date(iso)

    if (Number.isNaN(date.getTime())) {
        return iso
    }

    const pad = (value: number) => String(value).padStart(2, '0')

    return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 바이트 크기를 사람이 읽기 쉬운 단위로 바꾼다. */
function formatFileSize(bytes: number | null): string {
    if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) return '-'
    const units = ['B', 'KB', 'MB', 'GB']
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)}${units[exponent]}`
}

/** 초 단위 재생 시간을 분:초 형식으로 바꾼다. */
function formatDuration(seconds: number | null): string {
    if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return '-'
    const minutes = Math.floor(seconds / 60)
    return `${minutes}분 ${String(Math.floor(seconds % 60)).padStart(2, '0')}초`
}

/**
 * 서명 URL에서 재생 토큰만 뽑아낸다.
 *
 * 백엔드가 주는 downloadUrl은 토큰이 붙은 상대 경로라서, 재생용과 다운로드용 URL을
 * 각각 만들려면 토큰만 따로 필요하다.
 */
function extractContentToken(downloadUrl: string): string | null {
    const query = downloadUrl.slice(downloadUrl.indexOf('?') + 1)
    return new URLSearchParams(query).get('token')
}

export function FanMeetingCompletePage() {
    const { fanMeetingId } = useParams()
    const location = useLocation()
    const routeState = location.state as { meetingTitle?: string } | null
    const [session] = useState(() => getAuthSession())
    const [recording, setRecording] = useState<RecordingSummaryResponse | null>(null)
    const [detail, setDetail] = useState<RecordingDetailResponse>()
    const [contentToken, setContentToken] = useState<string>()
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string>()
    const [downloading, setDownloading] = useState(false)
    const [downloadError, setDownloadError] = useState<string>()
    const [refreshTick, setRefreshTick] = useState(0)

    useEffect(() => {
        if (!fanMeetingId?.trim() || !session) {
            setLoading(false)
            return
        }

        const abortController = new AbortController()
        setLoading(refreshTick === 0)
        setLoadError(undefined)

        getMyRecordings({ page: 0, size: 20 }, session.accessToken, abortController.signal)
            .then(async (pageData) => {
                const meetingId = Number(fanMeetingId)
                const matched = pageData.content.find((item) => item.meetingId === meetingId)
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
                    const { downloadUrl } = await issueRecordingDownloadUrl(
                        matched.recordingId,
                        session.accessToken,
                        abortController.signal,
                    )
                    if (abortController.signal.aborted) return
                    setContentToken(extractContentToken(downloadUrl) ?? undefined)
                } else {
                    setContentToken(undefined)
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
    }, [fanMeetingId, refreshTick, session])

    const recordingStatus = detail?.status ?? recording?.status
    const shouldPoll = Boolean(
        session &&
        !loadError &&
        (!recordingStatus || ['STARTING', 'RECORDING', 'PROCESSING'].includes(recordingStatus)),
    )

    useEffect(() => {
        if (!shouldPoll) return

        const intervalId = window.setInterval(
            () => setRefreshTick((tick) => tick + 1),
            5_000,
        )
        return () => window.clearInterval(intervalId)
    }, [shouldPoll])

    async function handleDownload() {
        if (!recording || !session) {
            return
        }

        setDownloading(true)
        setDownloadError(undefined)

        try {
            // 재생용으로 받아 둔 토큰이 있어도 다운로드 시점에 새로 발급해 만료를 피한다.
            const { downloadUrl } = await issueRecordingDownloadUrl(
                recording.recordingId,
                session.accessToken,
            )
            const token = extractContentToken(downloadUrl)
            window.open(
                token
                    ? buildRecordingContentUrl(recording.recordingId, token, true)
                    : downloadUrl,
                '_blank',
                'noopener',
            )
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
    const playbackUrl =
        recording && contentToken
            ? buildRecordingContentUrl(recording.recordingId, contentToken)
            : undefined
    const meetingTitle = recording?.meetingTitle ?? routeState?.meetingTitle ?? '팬미팅'
    const endedAt = recording?.completedAt

    let recordingTitle = '녹화 영상이 없습니다'
    let recordingDescription = '이번 팬미팅의 녹화 영상이 저장되지 않았습니다.'
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
    } else if (recordingStatus === 'FAILED') {
        recordingTitle = '녹화 영상을 저장하지 못했습니다'
        recordingDescription = detail?.failureMessage
            ?? '통화는 정상 종료되었지만 녹화 처리에 실패했습니다.'
        recordingVariant = 'error'
    } else if (isRecordingReady) {
        recordingTitle = '녹화 영상 저장이 완료되었습니다'
        recordingDescription = '아래에서 녹화 영상을 확인하고 다운로드할 수 있어요.'
        recordingVariant = 'success'
    } else if (recording) {
        if (recordingStatus === 'STARTING') {
            recordingTitle = '서버 녹화를 준비하고 있습니다'
            recordingDescription = '통화방의 녹화 작업을 시작하고 있습니다.'
        } else if (recordingStatus === 'RECORDING') {
            recordingTitle = '녹화 종료를 확인하고 있습니다'
            recordingDescription = '서버에서 통화 영상을 안전하게 마무리하고 있습니다.'
        } else {
            recordingTitle = '녹화 영상을 처리하고 있습니다'
            recordingDescription = '파일 검증이 끝나면 이 화면에서 자동으로 재생할 수 있습니다.'
        }
    }

    return (
        <main className="mx-auto w-full max-w-5xl">
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
                            {recordingDescription}
                        </AlertBanner>
                    </section>
                    {isRecordingReady && recording && (
                        <section className="mt-8 grid gap-6 lg:grid-cols-2">
                            <Card className="p-6">
                                <div className="min-w-0">
                                    {playbackUrl ? (
                                        <video
                                            className="aspect-video w-full rounded-[var(--radius-panel)] bg-black"
                                            controls
                                            controlsList="nodownload"
                                            preload="metadata"
                                            src={playbackUrl}
                                        >
                                            브라우저가 영상 재생을 지원하지 않습니다. 아래 다운로드 버튼을 이용해 주세요.
                                        </video>
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
                                                <dd className="font-semibold">{formatFileSize(detail.fileSizeBytes)}</dd>
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
                                        {recording.availableUntil
                                            ? formatDateTime(recording.availableUntil)
                                            : '보관 만료 시각 확인 전'}까지 유지됩니다.
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
                </CardContent>
            </Card>
        </main>
    )
}
