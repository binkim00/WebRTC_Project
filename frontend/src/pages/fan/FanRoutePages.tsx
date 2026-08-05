import { useParams } from 'react-router-dom'
import { VideoCallRoom } from '../../components/call/VideoCallRoom'
import { InvalidRouteState } from '../../components/routing/ScreenPage'
import { useTranslation } from '../../i18n'

export function FanMeetingCallPage() {
  const { t } = useTranslation()
  const { fanMeetingId, callSessionId } = useParams()

  if (!fanMeetingId?.trim()) {
    return (
      <InvalidRouteState
        message={t('fanRoutePages.t1')}
        title={t('fanRoutePages.t2')}
      />
    )
  }

  if (!callSessionId?.trim()) {
    return (
      <InvalidRouteState
        message={t('fanRoutePages.t3')}
        title={t('fanRoutePages.t4')}
      />
    )
  }

  return (
    <VideoCallRoom
      callSessionId={callSessionId}
      endTo={`/fan/fan-meetings/${fanMeetingId}/complete`}
      meetingId={fanMeetingId}
      participantLabel={t('fanRoutePages.t5')}
      screenId="FN-005"
    />
  )
}
