import { Buildings, Copy, Link as LinkIcon, UserMinus } from '@phosphor-icons/react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { getAuthSession } from '../../api/auth'
import {
  createOrganization,
  createOrganizationInvitation,
  getMyOrganization,
  removeOrganizationMember,
  type MyOrganizationMembers,
} from '../../api/organizations'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/data-display'
import { usePolling } from '../../hooks/usePolling'
import { AlertBanner } from '../../components/feedback/AlertBanner'
import { Button } from '../../components/ui/Button'
import { TextField, Textarea } from '../../components/ui/FormControls'

const initialForm = {
  name: '',
  businessNumber: '',
  representativeName: '',
  contactEmail: '',
  contactPhone: '',
  description: '',
}

type InvitationLink = {
  url: string
  expiresAt: string
}

/** 매니저의 조직 생성, 구성원 조회, 인플루언서 초대를 담당하는 실제 API 화면입니다. */
export function ManagerOrganizationPage() {
  const [data, setData] = useState<MyOrganizationMembers | null>(null)
  const [form, setForm] = useState(initialForm)
  const [influencerId, setInfluencerId] = useState('')
  const [invitation, setInvitation] = useState<InvitationLink>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()

  /**
   * 조직 정보를 읽습니다.
   *
   * @param showSpinner false면 화면 깜빡임 없이 조용히 갱신합니다(백그라운드 동기화용).
   * @param signal 폴링이 중단될 때 요청을 취소하기 위한 signal입니다.
   */
  const loadOrganization = useCallback(async (showSpinner = true, signal?: AbortSignal) => {
    const token = getAuthSession()?.accessToken
    if (!token) {
      setError('조직 정보를 조회하려면 먼저 로그인해 주세요.')
      setLoading(false)
      return
    }

    if (showSpinner) setLoading(true)
    setError(undefined)
    try {
      setData(await getMyOrganization(token, signal))
    } catch (cause) {
      // 폴링이 취소한 요청이면 사용자에게 보여줄 오류가 아닙니다.
      if (signal?.aborted) return
      setError(cause instanceof Error ? cause.message : '조직 정보를 불러오지 못했습니다.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  /** usePolling에 넘길 백그라운드 동기화 함수입니다. 스피너를 띄우지 않습니다. */
  const syncOrganization = useCallback(
    (signal: AbortSignal) => loadOrganization(false, signal),
    [loadOrganization],
  )

  // 최초 진입에서는 스피너와 함께 읽습니다.
  useEffect(() => {
    void loadOrganization()
  }, [loadOrganization])

  // 인플루언서가 다른 창에서 초대를 수락하면 매니저 화면에도 반영되어야 합니다.
  // 10초 주기 동기화와 창 포커스 복귀, 두 경로로 변경을 따라잡습니다.
  //
  // 이전 구현은 setInterval을 빈 의존성 useEffect 안에서 만들어 첫 렌더의 loadOrganization을
  // 계속 붙잡고 있었고(stale closure), 요청 취소도 하지 않아 언마운트 후 setState가 발생할 수
  // 있었습니다. 또 포커스 복귀 시 스피너를 띄워 목록이 깜빡였는데 이제는 조용히 갱신합니다.
  usePolling(syncOrganization, {
    intervalMs: 10_000,
    immediate: false,
    refreshOnFocus: true,
  })

  function setField(field: keyof typeof initialForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const token = getAuthSession()?.accessToken
    if (!token) return

    setSaving(true)
    setError(undefined)
    setMessage(undefined)
    try {
      await createOrganization({ ...form, description: form.description || undefined }, token)
      setMessage('조직이 생성되었습니다.')
      await loadOrganization()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '조직 생성에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  /** 입력한 회원번호가 유효하면 조직 ID와 함께 돌려주고, 아니면 오류를 표시한다. */
  function resolveInviteTarget() {
    const token = getAuthSession()?.accessToken
    const organizationId = data?.organization.organizationId
    const targetId = Number(influencerId)

    if (!token || !organizationId || !Number.isInteger(targetId) || targetId < 1) {
      setError('대상 인플루언서의 회원번호를 숫자로 입력해 주세요.')
      return null
    }
    return { token, organizationId, targetId }
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const target = resolveInviteTarget()
    if (!target) return

    setSaving(true)
    setError(undefined)
    setMessage(undefined)
    setCopied(false)
    try {
      const result = await createOrganizationInvitation(target.organizationId, target.targetId, target.token)
      const url = `${window.location.origin}/influencer/organization/invitations/${encodeURIComponent(result.token)}`
      setInvitation({ url, expiresAt: result.expiresAt })
      setInfluencerId('')
      setMessage('초대가 발급되었습니다. 아래 링크를 해당 인플루언서에게 전달해 주세요.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '인플루언서 초대에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function copyInvitationLink() {
    if (!invitation) return
    try {
      await navigator.clipboard.writeText(invitation.url)
      setCopied(true)
    } catch {
      setError('링크를 자동으로 복사하지 못했습니다. 링크를 직접 선택해 복사해 주세요.')
    }
  }

  async function shareInvitationLink() {
    if (!invitation || !navigator.share) return
    try {
      await navigator.share({ title: 'Melly 조직 초대', text: 'Melly 조직 초대 링크입니다.', url: invitation.url })
    } catch {
      // 사용자가 공유 창을 닫은 경우에는 오류를 표시하지 않습니다.
    }
  }

  async function handleRemove(userId: number) {
    const token = getAuthSession()?.accessToken
    const organizationId = data?.organization.organizationId
    if (!token || !organizationId) return

    setSaving(true)
    setError(undefined)
    try {
      await removeOrganizationMember(organizationId, userId, token)
      setMessage('구성원이 비활성화되었습니다.')
      await loadOrganization()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '구성원 제거에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="py-10 text-[var(--color-text-secondary)]">조직 정보를 불러오는 중입니다.</p>

  return (
    <div className="grid gap-7 pb-10">
      <header>
        <p className="text-sm font-black tracking-[0.12em] text-[var(--color-primary-coral)]">ORGANIZATION</p>
        <h1 className="mt-2 text-4xl font-black tracking-[-0.05em]">조직 관리</h1>
        <p className="mt-3 text-[var(--color-text-secondary)]">조직을 만들고 소속 인플루언서를 초대하세요.</p>
      </header>

      {error ? <AlertBanner title="조직 API 요청 실패" variant="error">{error}</AlertBanner> : null}
      {message ? <AlertBanner title="처리 완료" variant="success">{message}</AlertBanner> : null}

      {!data ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">새 조직 만들기</CardTitle>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">조직을 생성하면 현재 매니저 계정이 관리자 구성원으로 등록됩니다.</p>
          </CardHeader>
          <CardContent>
            <form className="grid gap-5" onSubmit={handleCreate}>
              <div className="grid gap-5 md:grid-cols-2">
                <TextField label="조직명" onChange={(event) => setField('name', event.currentTarget.value)} required value={form.name} />
                <TextField label="사업자등록번호" onChange={(event) => setField('businessNumber', event.currentTarget.value)} required value={form.businessNumber} />
                <TextField label="대표자명" onChange={(event) => setField('representativeName', event.currentTarget.value)} required value={form.representativeName} />
                <TextField label="대표 이메일" onChange={(event) => setField('contactEmail', event.currentTarget.value)} required type="email" value={form.contactEmail} />
                <TextField label="대표 전화번호" onChange={(event) => setField('contactPhone', event.currentTarget.value)} required value={form.contactPhone} />
              </div>
              <Textarea label="조직 설명" onChange={(event) => setField('description', event.currentTarget.value)} rows={4} value={form.description} />
              <div className="flex justify-end"><Button loading={saving} leadingIcon={<Buildings aria-hidden size={18} weight="bold" />} type="submit">조직 생성</Button></div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-wrap items-start justify-between gap-4">
              <div><p className="text-sm font-semibold text-[var(--color-primary-coral)]">현재 조직</p><CardTitle as="h2" className="mt-2 text-2xl">{data.organization.name}</CardTitle></div>
              <span className="rounded-full bg-[var(--color-success-soft)] px-3 py-1 text-sm font-bold text-[var(--color-success)]">{data.organization.status}</span>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <p><strong>대표자</strong> {data.organization.representativeName}</p>
              <p><strong>사업자번호</strong> {data.organization.businessNumber}</p>
              <p><strong>이메일</strong> {data.organization.contactEmail}</p>
              <p><strong>전화번호</strong> {data.organization.contactPhone}</p>
              {data.organization.description ? <p className="text-[var(--color-text-secondary)] sm:col-span-2">{data.organization.description}</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2">인플루언서 추가</CardTitle>
              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                회원번호로 초대 링크를 발급하세요. 인플루언서가 링크에서 수락해야 조직에 소속됩니다.
              </p>
            </CardHeader>
            <CardContent className="grid gap-5">
              <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleInvite}>
                <TextField containerClassName="min-w-0 flex-1" helperText="인플루언서 프로필의 회원번호" label="인플루언서 회원번호" onChange={(event) => setInfluencerId(event.currentTarget.value)} required type="number" value={influencerId} />
                <Button loading={saving} leadingIcon={<LinkIcon aria-hidden size={18} weight="bold" />} type="submit">초대 링크 발급</Button>
              </form>

              {invitation ? (
                <div className="grid gap-3 rounded-[var(--radius-control)] border border-[var(--color-primary-coral)]/30 bg-[var(--color-primary-coral-soft)] p-4">
                  <p className="font-bold">대상 인플루언서에게 아래 링크를 전달하세요.</p>
                  <a className="break-all text-sm underline" href={invitation.url}>{invitation.url}</a>
                  <p className="text-xs text-[var(--color-text-secondary)]">만료: {new Date(invitation.expiresAt).toLocaleString()}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" leadingIcon={<Copy aria-hidden size={16} />} onClick={() => void copyInvitationLink()}>{copied ? '복사됨' : '링크 복사'}</Button>
                    {typeof navigator.share === 'function' ? <Button size="sm" variant="secondary" leadingIcon={<LinkIcon aria-hidden size={16} />} onClick={() => void shareInvitationLink()}>공유</Button> : null}
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-3">
                <CardTitle as="h3" className="text-lg">구성원 목록</CardTitle>
                <Button size="sm" variant="secondary" onClick={() => void loadOrganization()}>새로고침</Button>
              </div>
              <ul className="divide-y divide-[var(--color-divider)] rounded-[var(--radius-control)] border border-[var(--color-divider)]">
                {data.members.map((member) => (
                  <li className="flex flex-wrap items-center justify-between gap-3 p-4" key={member.organizationMemberId}>
                    <div className="flex items-center gap-3">
                      {member.profileImageUrl ? <img alt="" className="size-10 rounded-full object-cover" src={member.profileImageUrl} /> : <span className="flex size-10 items-center justify-center rounded-full bg-[var(--color-primary-coral-soft)] font-bold text-[var(--color-primary-coral)]">{member.nickname.slice(0, 1)}</span>}
                      <div><p className="font-bold">{member.nickname}</p><p className="text-xs text-[var(--color-text-secondary)]">{member.userRole} · 회원번호 {member.userId}</p></div>
                    </div>
                    {member.userRole === 'INFLUENCER' ? <Button disabled={saving} leadingIcon={<UserMinus aria-hidden size={16} />} onClick={() => void handleRemove(member.userId)} size="sm" variant="secondary">제거</Button> : <span className="text-xs font-semibold text-[var(--color-text-tertiary)]">조직 관리자</span>}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
