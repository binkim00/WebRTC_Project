import { ScreenPage } from '../../components/routing/ScreenPage'

export function InfluencerMeetingReadyPage() {
  return (
    <ScreenPage
      description="인플루언서가 팬미팅 시작 전에 참여 상태를 확인하는 준비실입니다."
      requiredParams={['fanMeetingId']}
      screenId="ID-002"
      title="팬미팅 준비실"
    />
  )
}

export function InfluencerMeetingCallPage() {
  return (
    <ScreenPage
      description="인플루언서가 팬과 영상 통화를 진행하는 화면입니다."
      requiredParams={['fanMeetingId']}
      screenId="ID-003"
      title="영상 통화 화면"
    />
  )
}

export function InfluencerFanMemoPage() {
  return (
    <ScreenPage
      description="특정 팬미팅의 특정 팬에 대한 메모를 확인하고 작성하는 화면입니다."
      requiredParams={['fanMeetingId', 'fanId']}
      screenId="ID-004"
      title="메모 화면"
    />
  )
}

export function InfluencerMeetingHistoryPage() {
  return (
    <ScreenPage
      description="인플루언서가 진행한 팬미팅 이력을 확인하는 화면입니다."
      screenId="ID-005"
      title="나의 팬미팅 이력"
    />
  )
}

export function InfluencerProfilePage() {
  return (
    <ScreenPage
      description="인플루언서 마이페이지의 프로필 화면입니다."
      screenId="ID-006"
      title="인플루언서 마이페이지"
    />
  )
}
