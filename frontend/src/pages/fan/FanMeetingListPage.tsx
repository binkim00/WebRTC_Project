import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Button, Card, CardContent, CardFooter, Tabs } from '../../components'
import { InvalidRouteState } from '../../components/routing/ScreenPage'

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

const FAN_MEETING_TABS = [
    { value: 'upcoming', label: '예정' },
    { value: 'completed', label: '히스토리' },
] as const

export function FanMeetingListPage() {
    const [searchParam] = useSearchParams()
    const navigate = useNavigate()
    const status = searchParam.get('status')

    if (status !== 'upcoming' && status !== 'completed') {
        return (
            <InvalidRouteState
                message="status는 upcoming 또는 completed여야 합니다."
                title="팬미팅 목록 상태를 확인할 수 없습니다"
            />
        )
    }

    const isUpcoming = status === 'upcoming'
    const fanMeetings = MOCK_FAN_MEETINGS.filter(
        (fanMeeting) => fanMeeting.status === status,
    )

    return (
        <div className="mx-auto w-full max-w-6xl">
            <header>
                <Link
                    className="inline-flex items-center text-sm font-medium text-[var(--color-text-secondary)] transition-colors duration-200 hover:text-[var(--color-primary-coral)] motion-reduce:transition-none"
                    to="/fan/mypage/profile"
                >
                    ← 프로필로 돌아가기
                </Link>

                <h1 className="mt-5 text-4xl font-bold tracking-tight text-[var(--color-text-primary)]">
                    마이페이지
                </h1>

                <p className="mt-3 text-[var(--color-text-secondary)]">
                    내 정보와 참여 내역을 관리하세요.
                </p>
            </header>
            <section className="mt-12">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">팬미팅</h2>

                        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                            {isUpcoming
                                ? '다가오는 팬미팅을 확인하세요.'
                                : '참여한 팬미팅과 녹화 영상을 확인하세요.'}
                        </p>
                    </div>
                    <Tabs
                        ariaLabel="팬미팅 목록 상태"
                        items={FAN_MEETING_TABS}
                        onValueChange={(nextStatus) => navigate(`?status=${nextStatus}`)}
                        value={status}
                    />
                </div>

                <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                    {fanMeetings.map((fanMeeting) => (
                        <Card
                            className="overflow-hidden"
                            key={fanMeeting.id}
                        >
                            <div className="flex h-56 items-center justify-center bg-[var(--color-divider)] text-sm text-[var(--color-text-secondary)]">
                                이미지 영역
                            </div>
                            <CardContent>
                                <Badge variant={isUpcoming ? 'primary' : 'success'}>
                                    {isUpcoming ? '예정된 팬미팅' : '참여 완료'}
                                </Badge>
                                <h3 className="mt-3 text-xl font-bold text-[var(--color-text-primary)]">
                                    {fanMeeting.title}
                                </h3>
                                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                                    인플루언서 {fanMeeting.influencerName}
                                </p>
                                <div className="mt-6">
                                    <p className="text-sm text-[var(--color-text-secondary)]">
                                        {isUpcoming ? '팬미팅 일정' : '참여 일자'}
                                    </p>

                                    <p className="mt-1 font-semibold text-[var(--color-text-primary)]">
                                        {fanMeeting.meetingAt}
                                    </p>
                                </div>
                            </CardContent>
                            <CardFooter className="grid gap-4">
                                {isUpcoming ? (
                                    <>
                                        <p
                                            className={[
                                                'text-sm font-semibold',
                                                fanMeeting.canEnter
                                                    ? 'text-[var(--color-success)]'
                                                    : 'text-[var(--color-text-secondary)]',
                                            ].join(' ')}
                                        >
                                            {fanMeeting.canEnter
                                                ? '지금 입장할 수 있어요'
                                                : '입장 전에 장비를 확인해 주세요'}
                                        </p>
                                        <Button
                                            className="w-full"
                                            onClick={() =>
                                                navigate(`/fan/fan-meetings/${fanMeeting.id}/waiting`)
                                            }
                                            size="lg"
                                            variant={fanMeeting.canEnter ? 'primary' : 'secondary'}
                                        >
                                            {fanMeeting.canEnter ? '입장하기' : '장비 점검하기'}
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-sm text-[var(--color-text-secondary)]">
                                            영상 보관&nbsp;
                                            <strong className="text-[var(--color-text-primary)]">
                                                {fanMeeting.recordingExpiresAt}까지
                                            </strong>
                                        </p>
                                        <Badge className="w-fit" variant="success">
                                            녹화 영상 저장 완료
                                        </Badge>
                                        <Button className="w-full" size="lg" variant="secondary">
                                            녹화 영상 다운로드
                                        </Button>
                                    </>
                                )}
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            </section>
        </div>
    )
}
