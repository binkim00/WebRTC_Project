import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { getAuthSession } from '../../api/auth'
import {
    getMyRecordings,
    issueRecordingDownloadUrl,
    type RecordingSummaryResponse,
} from '../../api/recordings'
import { AlertBanner, Button, Card, CardContent } from '../../components'
import { InvalidRouteState } from '../../components/routing/ScreenPage'

const API_URL = import.meta.env.VITE_API_BASE_URL ?? ''

function formatDateTime(iso: string): string {
    const date = new Date(iso)

    if (Number.isNaN(date.getTime())) {
        return iso
    }

    const pad = (value: number) => String(value).padStart(2, '0')

    return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function FanMeetingCompletePage() {
    const { fanMeetingId } = useParams()
    const location = useLocation()
    const routeState = location.state as { meetingTitle?: string } | null
    const [session] = useState(() => getAuthSession())
    const [recording, setRecording] = useState<RecordingSummaryResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string>()
    const [downloading, setDownloading] = useState(false)
    const [downloadError, setDownloadError] = useState<string>()

    useEffect(() => {
        if (!fanMeetingId?.trim() || !session) {
            setLoading(false)
            return
        }

        const abortController = new AbortController()
        setLoading(true)
        setLoadError(undefined)

        getMyRecordings({ page: 0, size: 20 }, session.accessToken, abortController.signal)
            .then((pageData) => {
                const meetingId = Number(fanMeetingId)
                const matched = pageData.content.find((item) => item.meetingId === meetingId)
                setRecording(matched ?? null)
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
    }, [fanMeetingId, session])

    async function handleDownload() {
        if (!recording || !session) {
            return
        }

        setDownloading(true)
        setDownloadError(undefined)

        try {
            const { downloadUrl } = await issueRecordingDownloadUrl(
                recording.recordingId,
                session.accessToken,
            )
            window.open(`${API_URL}${downloadUrl}`, '_blank', 'noopener')
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

    const isRecordingReady = Boolean(recording?.playable)
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
    } else if (isRecordingReady) {
        recordingTitle = '녹화 영상 저장이 완료되었습니다'
        recordingDescription = '아래에서 녹화 영상을 확인하고 다운로드할 수 있어요.'
        recordingVariant = 'success'
    } else if (recording) {
        recordingTitle = '녹화 영상을 저장하고 있습니다'
        recordingDescription = '잠시만 기다려 주세요. 저장이 완료되면 이 화면에 표시됩니다.'
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
                                    <div className="flex aspect-video items-center justify-center rounded-[var(--radius-panel)] bg-[var(--color-divider)] text-[var(--color-text-secondary)]">
                                        녹화 영상 미리보기
                                    </div>
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
                </CardContent>
            </Card>
        </main>
    )
}
