import { useParams, useSearchParams } from 'react-router-dom'
import { VideoCallRoom } from '../../components'
import { InvalidRouteState } from '../../components/routing/ScreenPage'

export function FanMeetingCallPage() {
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
        message="실제 영상통화 입장에는 callSessionId가 필요합니다. 대기 화면에서 배정받은 통화 세션으로 입장해 주세요."
        title="통화 세션 ID가 없습니다"
      />
    )
  }

  return (
    <VideoCallRoom
      callSessionId={callSessionId}
      endTo={`/fan/fan-meetings/${fanMeetingId}/complete`}
      meetingId={fanMeetingId}
      participantLabel="인플루언서 영상"
      screenId="FN-005"
    />
  )
}
