import { Link, useParams } from "react-router-dom";
import { InvalidRouteState } from "../../components/routing/ScreenPage";
import { AlertBanner, Card, CardContent } from '../../components'

type RecordingStatus = 'processing' | 'ready'
type FanMeetingCompleteData = {
    meetingTitle: string
    endedAt: string
    endedAtLabel: string
    recordingStatus: RecordingStatus
}
const mockMeetingData: FanMeetingCompleteData = {
    meetingTitle: 'Melly와의 봄날 팬미팅',
    endedAt: '2026-08-02T19:00:00+09:00',
    endedAtLabel: '2026.08.02 19:00',
    recordingStatus: 'ready',
}

export function FanMeetingCompletePage() {
    const { fanMeetingId } = useParams();
    // API가 없으므로 테스트를 위한 일반 상수
    const {
        meetingTitle,
        endedAt,
        endedAtLabel,
        recordingStatus
    } = mockMeetingData

    const isRecordingReady = recordingStatus === 'ready'
    const recordingTitle = isRecordingReady ? '녹화 영상 저장이 완료되었습니다' : '녹화 영상을 저장하고 있습니다'
    const recordingDescription = isRecordingReady ? '아래에서 녹화 영상을 확인하고 다운로드할 수 있어요.' : '잠시만 기다려 주세요. 저장이 완료되면 이 화면에 표시됩니다.'

    if (!fanMeetingId?.trim()) {
        return (
            <InvalidRouteState
                message="URL에 필요한 fanMeetingId 값이 없습니다."
                title="필수 URL 파라미터가 없습니다."
            />
        )
    }

    return (
        <main className="mx-auto w-full max-w-5xl">
            <Card>
                <CardContent className="p-6 sm:p-10 lg:p-14">
                    <section className="border-b border-slate-200 pb-10 text-center">
                        <div
                            aria-hidden="true"
                            className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-2xl font-bold text-emerald-700"
                        >
                            ✓
                        </div>
                        <h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-950">
                            팬미팅이 종료되었습니다
                        </h1>
                        <p className="mt-3 text-slate-500">
                            소중한 시간을 함께해 주셔서 감사합니다.
                        </p>
                    </section>
                    <section
                        aria-live="polite"
                        className="pt-8"
                    >
                        <AlertBanner
                            title={recordingTitle}
                            variant={isRecordingReady ? 'success' : 'info'}
                        >
                            {recordingDescription}
                        </AlertBanner>
                    </section>
                    {isRecordingReady && (
                        <section className="mt-8 grid gap-6 lg:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200 p-6">
                                <div className="min-w-0">
                                    <div className="flex aspect-video items-center justify-center rounded-2xl bg-slate-200 text-slate-500">
                                        녹화 영상 미리보기
                                    </div>
                                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <strong className="text-slate-950">
                                            {meetingTitle}
                                        </strong>

                                        <time className="text-sm text-slate-500"
                                            dateTime={endedAt}
                                        >
                                            {endedAtLabel}
                                        </time>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-4">
                                <div className="rounded-2xl bg-slate-50 p-6">
                                    <h2 className="text-lg font-bold text-slate-950">
                                        다운로드 유의사항
                                    </h2>
                                    <p className="mt-3 text-sm leading-6 text-slate-600">
                                        영상은 마이페이지의 팬미팅 히스토리에서 5일 동안 유지됩니다.
                                        기간 안에 필요한 영상을 다운로드해 주세요.
                                    </p>
                                </div>

                                <div className="mt-auto grid gap-3">

                                    <button
                                        className="min-h-12 rounded-lg bg-slate-900 px-5 font-semibold text-white"
                                        type="button"
                                    >
                                        녹화 영상 다운로드
                                    </button>
                                    <Link
                                        className="inline-flex min-h-12 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 font-semibold text-slate-900 transition hover:bg-slate-50"
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