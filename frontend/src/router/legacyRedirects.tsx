import { Navigate, useParams } from 'react-router-dom'

/**
 * 이전 `/manager/events/*` 주소를 통합된 팬미팅 관리 주소로 그대로 넘겨준다.
 *
 * 백엔드에는 홍보·응모용 객체가 따로 없어 관리 화면을 팬미팅 하나로 합쳤으므로,
 * 북마크나 기존 링크로 들어온 사용자가 404를 만나지 않게 같은 팬미팅으로 보낸다.
 */
export function LegacyEventRedirect({ tab }: { tab?: string }) {
  const { eventId } = useParams<{ eventId: string }>()
  const base = eventId
    ? `/manager/fan-meetings/${encodeURIComponent(eventId)}`
    : '/manager/fan-meetings'
  return <Navigate replace to={tab ? `${base}?tab=${tab}` : base} />
}

/** 이전 팬미팅 설정 주소를 통합 상세 화면의 설정 탭으로 넘겨준다. */
export function LegacyMeetingSettingsRedirect() {
  const { fanMeetingId } = useParams<{ fanMeetingId: string }>()
  return (
    <Navigate
      replace
      to={`/manager/fan-meetings/${encodeURIComponent(fanMeetingId ?? '')}?tab=settings`}
    />
  )
}
