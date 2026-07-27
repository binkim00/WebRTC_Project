import { Link, useSearchParams } from "react-router-dom"
import { InvalidRouteState } from "../../components/routing/ScreenPage"

type FanMeetingListItem = {
    id: number
    title: string
    influencerName: string
    meetingAt: string
    status: 'upcoming' | 'completed'
    canEnter?: boolean
    recordingExpiresAt?: string
}

const MOCK_FAN_MEETINGS: FanMeetingListItem[] = [
    {
        id: 1,
        title: 'Melly와의 봄날 팬미팅',
        influencerName: 'Melly',
        meetingAt: '2026.08.02 19:00',
        status: 'upcoming',
        canEnter: true,
    },
    {
        id: 2,
        title: '서윤의 여름밤 팬미팅',
        influencerName: '서윤',
        meetingAt: '2026.08.15 20:00',
        status: 'upcoming',
        canEnter: false,
    },
    {
        id: 3,
        title: '하나와 첫 온라인 팬사인회',
        influencerName: '하나',
        meetingAt: '2026.07.25 19:30',
        status: 'completed',
        recordingExpiresAt: '2026.07.30',
    },
    {
        id: 4,
        title: '민과 함께한 여름 오후',
        influencerName: '민',
        meetingAt: '2026.07.24 17:00',
        status: 'completed',
        recordingExpiresAt: '2026.07.29',
    },
    {
        id: 5,
        title: 'Melly와의 첫 번째 팬미팅',
        influencerName: 'Melly',
        meetingAt: '2026.07.22 20:00',
        status: 'completed',
        recordingExpiresAt: '2026.07.27',
    },
]

export function FanMeetingListPage() {
    const [searchParam] = useSearchParams()
    const status = searchParam.get('status')
    const isUpcoming = status === 'upcoming'

    const fanMeetings = MOCK_FAN_MEETINGS.filter(
        (fanMeeting) => fanMeeting.status === status,
    )

    if (status !== 'upcoming' && status !== 'completed') {
        return (
            <InvalidRouteState
                message="status는 upcoming 또는 completed여야 합니다."
                title="팬미팅 목록 상태를 확인할 수 없습니다"
            />
        )
    }

    return (
        <main className="mx-auto w-full max-w-6xl">
            <header>
                <Link
                    className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900"
                    to="/fan/mypage/profile"
                >
                    ← 프로필로 돌아가기
                </Link>

                <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-950">
                    마이페이지
                </h1>

                <p className="mt-3 text-slate-500">
                    내 정보와 참여 내역을 관리하세요.
                </p>
            </header>
            <section className="mt-12">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-950">팬미팅</h2>

                        <p className="mt-2 text-sm text-slate-500">
                            {isUpcoming
                                ? '다가오는 팬미팅을 확인하세요.'
                                : '참여한 팬미팅과 녹화 영상을 확인하세요.'}
                        </p>
                    </div>
                    <nav
                        aria-label="팬미팅 목록 상태"
                        className="mt-6 inline-grid grid-cols-2 rounded-xl border border-slate-200 bg-white p-1"
                    >
                        <Link
                            aria-current={isUpcoming ? 'page' : undefined}
                            className={[
                                'rounded-lg px-6 py-2 text-sm font-semibold transition',
                                isUpcoming ? 'bg-red-600 text-white' : 'text-slate-600 hover:bg-slate-100',
                            ].join(' ')}
                            to="?status=upcoming"
                        >
                            예정
                        </Link>

                        <Link
                            aria-current={!isUpcoming ? 'page' : undefined}
                            className={[
                                'rounded-lg px-6 py-2 text-sm font-semibold transition',
                                !isUpcoming ? 'bg-red-600 text-white' : 'text-slate-600 hover:bg-slate-100',
                            ].join(' ')}
                            to="?status=completed"
                        >
                            히스토리
                        </Link>
                    </nav>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                    {fanMeetings.map((fanMeeting) => (
                        <article
                            key={fanMeeting.id}
                            className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                        >
                            <div className="flex h-56 items-center justify-center bg-slate-200 text-sm text-slate-500">
                                이미지 영역
                            </div >
                            <div className="p-6">
                                <p className="text-sm font-semibold text-red-600">
                                    {fanMeeting.status === 'upcoming'
                                        ? '예정된 팬미팅'
                                        : '참여 완료'}
                                </p>
                                <h3 className="mt-2 text-xl font-bold text-slate-950">
                                    {fanMeeting.title}
                                </h3>
                                <p className="mt-2 text-sm text-slate-500">
                                    인플루언서 {fanMeeting.influencerName}
                                </p>
                                <div className="mt-6">
                                    <p className="text-sm text-slate-500">
                                        {fanMeeting.status === 'upcoming'
                                            ? '팬미팅 일정'
                                            : '참여 일자'}
                                    </p>

                                    <p className="mt-1 font-semibold text-slate-950">
                                        {fanMeeting.meetingAt}
                                    </p>
                                    {isUpcoming ? (
                                        <div className="mt-6 border-t border-slate-200 pt-5">
                                            <p
                                                className={[
                                                    'mb-4 text-sm font-semibold',
                                                    fanMeeting.canEnter ? 'text-green-600' : 'text-slate-500',
                                                ].join(' ')}
                                            >
                                                {fanMeeting.canEnter
                                                    ? '지금 입장할 수 있어요'
                                                    : '입장 전에 장비를 확인해 주세요'}
                                            </p>

                                            <button
                                                className={[
                                                    'w-full rounded-xl border px-4 py-3 font-semibold',
                                                    fanMeeting.canEnter
                                                        ? 'border-red-600 bg-red-600 text-white'
                                                        : 'border-slate-300 bg-white text-slate-900',
                                                ].join(' ')}
                                                type="button"
                                            >
                                                {fanMeeting.canEnter ? '입장하기' : '장비 점검하기'}
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="mt-6 border-t border-slate-200 pt-5">
                                            <p className="text-sm text-slate-500">
                                                영상 보관&nbsp;
                                                <strong className="text-slate-950">
                                                    {fanMeeting.recordingExpiresAt}까지
                                                </strong>
                                            </p>

                                            <p className="mt-4 text-sm font-semibold text-green-600">
                                                ● 녹화 영상 저장 완료
                                            </p>

                                            <button
                                                className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-900"
                                                type="button"
                                            >
                                                녹화 영상 다운로드
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </article>
                    ))
                    }
                </div>
            </section>
        </main>
    )
}