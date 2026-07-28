import { useParams, useSearchParams } from 'react-router-dom'
import { VideoCallRoom } from '../../components'
import { InvalidRouteState, ScreenPage } from '../../components/routing/ScreenPage'

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
  const { fanMeetingId, callSessionId } = useParams()
  const [searchParams] = useSearchParams()
  const isDesignPreview = import.meta.env.DEV && searchParams.get('preview') === '1'

  if (!fanMeetingId?.trim()) {
    return (
      <InvalidRouteState
        message="URL에 필요한 fanMeetingId 값이 없습니다. 이전 화면에서 올바른 팬미팅을 선택해 주세요."
        title="필수 URL 파라미터가 없습니다"
      />
    )
  }

  if (!callSessionId?.trim() && !isDesignPreview) {
    return (
      <InvalidRouteState
        message="실제 영상통화 입장에는 callSessionId가 필요합니다. 준비실에서 현재 통화 세션으로 입장해 주세요."
        title="통화 세션 ID가 없습니다"
      />
    )
  }

  return (
    <VideoCallRoom
      callSessionId={callSessionId}
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
