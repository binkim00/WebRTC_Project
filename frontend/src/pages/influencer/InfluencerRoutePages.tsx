import { useParams } from 'react-router-dom'
import { VideoCallRoom } from '../../components/call/VideoCallRoom'
import { InvalidRouteState } from '../../components/routing/ScreenPage'
import { InfluencerCallSidePanel } from './InfluencerCallSidePanel'
import { useTranslation } from '../../i18n'

export function InfluencerMeetingCallPage() {
  const { t } = useTranslation()
  const { fanMeetingId, callSessionId } = useParams()

  if (!fanMeetingId?.trim()) {
    return (
      <InvalidRouteState
        message={t('influencerRoutePages.t1')}
        title={t('influencerRoutePages.t2')}
      />
    )
  }

  if (!callSessionId?.trim()) {
    return (
      <InvalidRouteState
        message={t('influencerRoutePages.t3')}
        title={t('influencerRoutePages.t4')}
      />
    )
  }

  return (
    <VideoCallRoom
      callSessionId={callSessionId}
      // 통화가 끝나면 다음 팬을 호출·입장할 대기실로 복귀한다.
      // (이전에는 소속 인플루언서를 마이페이지로 보내 대기열도, 다음 팬 입장 수단도 없는 곳에 떨어졌고,
      //  1인 운영자의 대기열 오픈·호출도 지금은 운영 콘솔이 아니라 대기실에 있다.)
      endTo={`/influencer/fan-meetings/${encodeURIComponent(fanMeetingId)}/ready`}
      meetingId={fanMeetingId}
      participantLabel="팬 영상"
      screenId="ID-003"
      sidePanel={<InfluencerCallSidePanel meetingId={fanMeetingId} />}
      forceEndOnLeave
      // 팬미팅 LiveKit Room은 팬미팅당 하나이므로, 팬이 교체될 때 방을 나가지 않고 머문다.
      // (이전에는 통화 세션이 끝날 때마다 방을 나가고 화면을 이탈해 차례마다 튕겨 나갔다.)
      hostStaysConnected
    />
  )
}
