import { CheckCircle, Buildings } from '@phosphor-icons/react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAuthSession } from '../../api/auth'
import { acceptOrganizationInvitation } from '../../api/organizations'
import { AlertBanner } from '../../components/feedback/AlertBanner'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/data-display'
import { Button } from '../../components/ui/Button'

/** 초대 링크를 받은 인플루언서가 조직 가입을 확정하는 화면입니다. */
export function InfluencerOrganizationInvitationPage() {
  const { token } = useParams<{ token: string }>()
  const [accepted, setAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()
  const [organizationName, setOrganizationName] = useState('')

  async function handleAccept() {
    const authToken = getAuthSession()?.accessToken
    if (!authToken) { setError('초대를 수락하려면 인플루언서 계정으로 로그인해 주세요.'); return }
    if (!token) { setError('초대 토큰이 없습니다. 매니저에게 새 초대를 요청해 주세요.'); return }

    setSubmitting(true); setError(undefined)
    try {
      const response = await acceptOrganizationInvitation(token, authToken)
      setOrganizationName(response.organization.name)
      setAccepted(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '조직 초대 수락에 실패했습니다.') }
    finally { setSubmitting(false) }
  }

  return <div className="mx-auto grid w-full max-w-2xl gap-6 py-10">
    <header><p className="text-sm font-black tracking-[0.12em] text-[var(--color-primary-coral)]">ORGANIZATION INVITATION</p><h1 className="mt-2 text-4xl font-black tracking-[-0.05em]">조직 초대</h1><p className="mt-3 text-[var(--color-text-secondary)]">매니저가 보낸 초대를 확인하고 조직에 합류하세요.</p></header>
    {error ? <AlertBanner title="초대 수락 실패" variant="error">{error}</AlertBanner> : null}
    <Card><CardHeader><div className="flex size-14 items-center justify-center rounded-2xl bg-[var(--color-primary-coral-soft)] text-[var(--color-primary-coral)]"><Buildings aria-hidden size={28} weight="duotone" /></div><CardTitle as="h2" className="mt-5">{accepted ? '조직에 합류했습니다' : '조직 초대를 수락하시겠어요?'}</CardTitle></CardHeader><CardContent className="grid gap-5">{accepted ? <AlertBanner title="수락 완료" variant="success"><span className="inline-flex items-center gap-2"><CheckCircle aria-hidden weight="fill" /> {organizationName} 조직의 구성원으로 등록되었습니다.</span></AlertBanner> : <><p className="text-sm leading-6 text-[var(--color-text-secondary)]">수락하면 현재 로그인한 인플루언서 계정이 해당 조직의 활성 구성원으로 등록됩니다. 초대 토큰은 한 번만 사용할 수 있습니다.</p><Button loading={submitting} onClick={() => void handleAccept()}>초대 수락</Button></>}</CardContent></Card>
    {accepted ? <Link className="text-center font-semibold text-[var(--color-primary-coral)]" to="/influencer/mypage/profile">내 프로필로 이동</Link> : null}
  </div>
}
