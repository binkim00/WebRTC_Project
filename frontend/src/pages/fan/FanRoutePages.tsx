import { Link, useSearchParams } from 'react-router-dom'
import { InvalidRouteState, ScreenPage } from '../../components/routing/ScreenPage'

export function FanEventListPage() {
  return (
    <ScreenPage
      description="팬이 참여할 수 있는 홍보 이벤트 목록 화면입니다."
      screenId="FN-001"
      title="홍보 목록 화면"
    />
  )
}

export function FanEventDetailPage() {
  return (
    <ScreenPage
      description="선택한 이벤트의 상세 내용과 응모 진입점을 제공하는 화면입니다."
      requiredParams={['eventId']}
      screenId="FN-002"
      title="홍보 상세·응모 화면"
    />
  )
}

export function FanApplicationResultPage() {
  return (
    <ScreenPage
      description="특정 이벤트의 응모 결과를 확인하는 화면입니다."
      requiredParams={['eventId']}
      screenId="FN-003"
      title="응모 결과 확인 화면"
    />
  )
}

export function FanMeetingWaitingPage() {
  return (
    <ScreenPage
      description="영상 통화 시작 전 순서를 기다리는 팬 화면입니다."
      requiredParams={['fanMeetingId']}
      screenId="FN-004"
      title="대기 화면"
    />
  )
}

export function FanMeetingCallPage() {
  return (
    <ScreenPage
      description="팬이 인플루언서와 영상 통화를 진행하는 화면입니다."
      requiredParams={['fanMeetingId']}
      screenId="FN-005"
      title="영상 통화 화면"
    />
  )
}

export function FanMeetingCompletePage() {
  return (
    <ScreenPage
      description="영상 통화가 끝난 뒤 표시되는 완료 화면입니다."
      requiredParams={['fanMeetingId']}
      screenId="FN-006"
      title="영상 통화 종료 화면"
    />
  )
}

export function FanProfilePage() {
  return (
    <ScreenPage
      description="팬 마이페이지의 프로필 영역입니다."
      screenId="FN-007"
      title="팬 마이페이지 화면 - 프로필"
    />
  )
}

export function FanApplicationsPage() {
  return (
    <ScreenPage
      description="팬이 응모한 이벤트를 모아 보는 마이페이지 영역입니다."
      screenId="FN-007"
      title="응모한 이벤트"
    />
  )
}

export function FanMeetingListPage() {
  const [searchParams] = useSearchParams()
  const status = searchParams.get('status')

  if (status !== 'upcoming' && status !== 'completed') {
    return (
      <InvalidRouteState
        message="status 검색 파라미터는 upcoming 또는 completed여야 합니다."
        title="팬미팅 목록 상태를 확인할 수 없습니다"
      />
    )
  }

  const isUpcoming = status === 'upcoming'

  return (
    <ScreenPage
      description={
        isUpcoming
          ? '앞으로 진행될 팬미팅을 확인하는 마이페이지 영역입니다.'
          : '완료된 팬미팅 이력을 확인하는 마이페이지 영역입니다.'
      }
      screenId="FN-007"
      title={isUpcoming ? '팬미팅 예정' : '팬미팅 히스토리'}
    >
      <div className="flex flex-wrap gap-2">
        <Link
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          to="/fan/mypage/fan-meetings?status=upcoming"
        >
          예정
        </Link>
        <Link
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          to="/fan/mypage/fan-meetings?status=completed"
        >
          완료
        </Link>
      </div>
    </ScreenPage>
  )
}
