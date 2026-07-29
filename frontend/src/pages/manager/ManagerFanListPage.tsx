import { ArrowLeft } from '@phosphor-icons/react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { AlertBanner } from '../../components'
import { InfluencerFanListPage } from '../influencer/InfluencerFanListPage'

export function ManagerFanListPage() {
  const { fanMeetingId } = useParams<{ fanMeetingId: string }>()
  const [searchParams] = useSearchParams()
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === '1'

  if (isPreview) return <InfluencerFanListPage />

  return (
    <div className="grid gap-7 pb-10">
      <header className="grid gap-2">
        <Link className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-primary-coral)]" to="/manager/fan-meetings">
          <ArrowLeft size={17} /> 팬미팅 관리로 돌아가기
        </Link>
        <h1 className="text-4xl font-black tracking-[-0.055em]">확정 팬 리스트</h1>
        <p className="text-[var(--color-text-secondary)]">팬미팅 #{fanMeetingId} 참가자 정보를 확인하세요.</p>
      </header>
      <AlertBanner title="참가자 조회 API가 아직 구현되지 않았습니다" variant="warning">
        첨부된 API 구현 현황 기준으로 <code>GET /api/v1/fan-meetings/{'{meetingId}'}/participants</code>를 사용할 수 없습니다.
        대기열 운영은 모니터링 화면에서 사용할 수 있습니다.
      </AlertBanner>
    </div>
  )
}
