import { useParams } from 'react-router-dom'
import { VideoCallRoom } from '../../components'
import { InvalidRouteState, ScreenPage } from '../../components/routing/ScreenPage'

export function InfluencerMeetingCallPage() {
  const { fanMeetingId } = useParams()

  if (!fanMeetingId?.trim()) {
    return (
      <InvalidRouteState
        message="URL에 필요한 fanMeetingId 값이 없습니다. 이전 화면에서 올바른 팬미팅을 선택해 주세요."
        title="필수 URL 파라미터가 없습니다"
      />
    )
  }

  return (
    <VideoCallRoom
      endTo="/influencer/mypage/fan-meetings"
      meetingId={fanMeetingId}
      participantLabel="팬 영상"
      screenId="ID-003"
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
