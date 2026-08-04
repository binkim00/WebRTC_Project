import { getAuthSession } from '../../api/auth'
import { InfluencerFanListPage } from '../influencer/InfluencerFanListPage'

/**
 * 팬미팅 참가자 목록은 역할에 따라 데이터가 달라지는 화면이 아니라
 * 매니저와 인플루언서가 같은 API와 UI를 공유하는 공통 화면이다.
 */
export function FanMeetingParticipantsPage() {
  // 공통 URL로 진입해도 실제 역할을 전달해 매니저를 인플루언서 전용 기록 경로로 보내지 않는다.
  return <InfluencerFanListPage viewerRole={getAuthSession()?.role} />
}
