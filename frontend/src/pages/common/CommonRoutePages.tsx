import { Link } from 'react-router-dom'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '../../components'
import { ScreenPage } from '../../components/routing/ScreenPage'

const routeGroups = [
  {
    title: '팬',
    description: '이벤트를 살펴보고 팬미팅 참여 흐름을 확인합니다.',
    to: '/fan/events',
    badge: '이벤트 참여',
    variant: 'primary',
  },
  {
    title: '인플루언서',
    description: '프로필을 관리하고 팬미팅 진행 흐름을 확인합니다.',
    to: '/influencer/mypage/profile',
    badge: '팬미팅 진행',
    variant: 'info',
  },
  {
    title: '매니저',
    description: '이벤트와 팬미팅 운영 화면으로 이동합니다.',
    to: '/manager/events',
    badge: '서비스 운영',
    variant: 'success',
  },
] as const

export function HomePage() {
  return (
    <div className="grid gap-10">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-violet-700 via-violet-700 to-fuchsia-700 px-6 py-12 text-white shadow-lg sm:px-10 sm:py-16">
        <Badge className="bg-white/15 text-white" variant="primary">
          MAIN-001
        </Badge>
        <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          팬과 아티스트가 만나는 순간을 더 가깝게
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-violet-100 sm:text-lg">
          MELLY의 이벤트와 팬미팅 화면을 역할에 맞게 둘러보세요.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            className="inline-flex min-h-12 items-center justify-center rounded-lg bg-white px-5 py-2.5 font-semibold text-violet-800 transition hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-violet-700"
            to="/fan/events"
          >
            이벤트 둘러보기
          </Link>
          <Link
            className="inline-flex min-h-12 items-center justify-center rounded-lg border border-white/50 px-5 py-2.5 font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-violet-700"
            to="/login"
          >
            로그인
          </Link>
        </div>
      </section>

      <section aria-labelledby="role-routes-title">
        <div className="mb-5">
          <p className="text-sm font-semibold text-violet-700">역할별 시작점</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-950" id="role-routes-title">
            필요한 화면으로 바로 이동하세요
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
        {routeGroups.map((group) => (
          <Link
            className="rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
            key={group.to}
            to={group.to}
          >
            <Card className="h-full" interactive>
              <CardHeader>
                <Badge variant={group.variant}>{group.badge}</Badge>
                <CardTitle className="mt-4">{group.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-slate-600">{group.description}</p>
                <span className="mt-5 inline-flex text-sm font-semibold text-violet-700">
                  화면으로 이동 →
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
        </div>
      </section>
    </div>
  )
}

export function MeetingFanListPage() {
  return (
    <ScreenPage
      description="특정 팬미팅에 참여하는 팬 목록을 확인하는 공통 화면입니다."
      requiredParams={['fanMeetingId']}
      screenId="CM-FN-ID-001"
      title="팬 리스트 화면"
    />
  )
}

export function MeetingStatisticsPage() {
  return (
    <ScreenPage
      description="특정 팬미팅의 통계를 확인하는 공통 화면입니다."
      requiredParams={['fanMeetingId']}
      screenId="CM-ID-MG-001"
      title="팬미팅 통계 화면"
    />
  )
}
