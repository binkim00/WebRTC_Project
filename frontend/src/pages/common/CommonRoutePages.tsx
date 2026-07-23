import { Link } from 'react-router-dom'
import { ScreenPage } from '../../components/routing/ScreenPage'

const routeGroups = [
  {
    title: '팬',
    description: '이벤트 목록과 팬미팅 참여 흐름',
    to: '/fan/events',
  },
  {
    title: '인플루언서',
    description: '프로필과 팬미팅 진행 흐름',
    to: '/influencer/mypage/profile',
  },
  {
    title: '매니저',
    description: '이벤트와 팬미팅 운영 흐름',
    to: '/manager/events',
  },
] as const

export function HomePage() {
  return (
    <ScreenPage
      description="MELLY 서비스의 역할별 화면으로 이동하는 공통 시작 화면입니다."
      screenId="MAIN-001"
      title="메인 페이지"
    >
      <div className="grid gap-4 md:grid-cols-3">
        {routeGroups.map((group) => (
          <Link
            className="rounded-xl border border-slate-200 p-4 transition hover:border-violet-300 hover:bg-violet-50"
            key={group.to}
            to={group.to}
          >
            <strong className="text-slate-950">{group.title}</strong>
            <span className="mt-2 block text-sm text-slate-600">{group.description}</span>
          </Link>
        ))}
      </div>
    </ScreenPage>
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

export function DeviceCheckPage() {
  return (
    <ScreenPage
      description="팬미팅 영상 통화 전에 카메라와 마이크 상태를 확인하는 공통 화면입니다."
      requiredParams={['fanMeetingId']}
      screenId="CM-FN-ID-002"
      title="장비 점검 화면"
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
