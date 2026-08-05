import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { getAuthSession } from '../../api/authSession'
import {
  createOrganization,
  createOrganizationInvitation,
  getMyOrganization,
  removeOrganizationMember,
  type MyOrganizationMembers,
  type OrganizationMember,
} from '../../api/organizations'
import { usePolling } from '../../hooks/usePolling'
import { useNowTicker } from '../../hooks/useNowTicker'
import { AlertBanner } from '../../components/feedback/AlertBanner'
import { Dialog } from '../../components/feedback/Dialog'
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

/** 이 세션에서 발급한 초대 한 건이다. 초대 목록 조회 API가 없어 발급분만 기억한다. */
type IssuedInvitation = {
  influencerId: number
  token: string
  url: string
  expiresAt: string
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

/** 2026.03.02 — 합류일 표기다. */
function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`
}

/** 2026.08.03 14:20 — 초대 만료 시각 표기다. */
function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${formatDate(value)} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function isExpired(invitation: IssuedInvitation, now: number): boolean {
  const expiry = new Date(invitation.expiresAt).getTime()
  return Number.isFinite(expiry) && expiry <= now
}

const roleLabels: Record<string, string> = {
  MANAGER: '매니저',
  INFLUENCER: '인플루언서',
  SOLO_INFLUENCER: '인플루언서',
}

/**
 * 매니저의 조직 생성, 구성원 관리, 인플루언서 초대 화면이다.
 * (Manager Organization.dc.html — no-org·default·no-invites·invite-error 상태)
 *
 * 초대는 이메일이 아니라 회원번호 기반 API만 있고, 보낸 초대 목록 API가 없어
 * 이 세션에서 발급한 초대만 우측 패널에 표시한다.
 */
export function ManagerOrganizationPage() {
  const [data, setData] = useState<MyOrganizationMembers | null>(null)
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string>()

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteId, setInviteId] = useState('')
  const [inviteTouched, setInviteTouched] = useState(false)
  const [inviteServerError, setInviteServerError] = useState<string>()
  const [sending, setSending] = useState(false)
  const [invitations, setInvitations] = useState<IssuedInvitation[]>([])
  const [copiedToken, setCopiedToken] = useState<string>()
  const [reissuedToken, setReissuedToken] = useState<string>()
  const [reissuingId, setReissuingId] = useState<number>()

  const [removeTarget, setRemoveTarget] = useState<OrganizationMember>()
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string>()

  // 초대 만료 표시가 시각에 맞게 바뀌도록 1분마다 갱신한다.
  const now = useNowTicker(60_000)
  const sessionUserId = getAuthSession()?.userId

  /**
   * 조직 정보를 읽는다.
   *
   * @param showSpinner false면 화면 깜빡임 없이 조용히 갱신한다(백그라운드 동기화용).
   * @param signal 폴링이 중단될 때 요청을 취소하기 위한 signal이다.
   */
  const loadOrganization = useCallback(async (showSpinner = true, signal?: AbortSignal) => {
    const token = getAuthSession()?.accessToken
    if (!token) {
      setError('조직 정보를 조회하려면 먼저 로그인해 주세요.')
      setLoading(false)
      return
    }

    if (showSpinner) setLoading(true)
    try {
      setData(await getMyOrganization(token, signal))
      setError(undefined)
    } catch (cause) {
      // 폴링이 취소한 요청이면 사용자에게 보여줄 오류가 아니다.
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

  const requiredFilled =
    form.name.trim() !== '' &&
    form.businessNumber.trim() !== '' &&
    form.representativeName.trim() !== '' &&
    form.contactEmail.trim() !== '' &&
    form.contactPhone.trim() !== ''

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const token = getAuthSession()?.accessToken
    if (!token || !requiredFilled || creating) return

    setCreating(true)
    setError(undefined)
    try {
      await createOrganization({ ...form, description: form.description || undefined }, token)
      await loadOrganization()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '조직 생성에 실패했습니다.')
    } finally {
      setCreating(false)
    }
  }

  /** 회원번호로 초대 토큰을 발급하고 세션 목록에 기록한다. 같은 대상은 최신 발급으로 교체한다. */
  async function issueInvitation(influencerId: number): Promise<IssuedInvitation | null> {
    const token = getAuthSession()?.accessToken
    const organizationId = data?.organization.organizationId
    if (!token || !organizationId) return null

    const result = await createOrganizationInvitation(organizationId, influencerId, token)
    const issued: IssuedInvitation = {
      influencerId,
      token: result.token,
      url: `${window.location.origin}/influencer/organization/invitations/${encodeURIComponent(result.token)}`,
      expiresAt: result.expiresAt,
    }
    setInvitations((current) => [
      issued,
      ...current.filter((entry) => entry.influencerId !== influencerId),
    ])
    return issued
  }

  const inviteIdNumber = Number(inviteId)
  const inviteIdValid = inviteId.trim() !== '' && Number.isInteger(inviteIdNumber) && inviteIdNumber > 0
  const inviteInputError =
    inviteTouched && inviteId.trim() !== '' && !inviteIdValid
      ? '대상 인플루언서의 회원번호를 숫자로 입력해 주세요.'
      : undefined

  async function handleSendInvite() {
    if (!inviteIdValid || sending) return

    setSending(true)
    setInviteServerError(undefined)
    try {
      const issued = await issueInvitation(inviteIdNumber)
      if (issued) {
        setInviteOpen(false)
        setInviteId('')
        setInviteTouched(false)
      }
    } catch (cause) {
      setInviteServerError(
        cause instanceof Error ? cause.message : '인플루언서 초대에 실패했습니다.',
      )
    } finally {
      setSending(false)
    }
  }

  async function handleReissue(invitation: IssuedInvitation) {
    if (reissuingId !== undefined) return
    setReissuingId(invitation.influencerId)
    try {
      const issued = await issueInvitation(invitation.influencerId)
      if (issued) {
        setReissuedToken(issued.token)
        setCopiedToken(undefined)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '초대 링크를 재발급하지 못했습니다.')
    } finally {
      setReissuingId(undefined)
    }
  }

  async function handleCopy(invitation: IssuedInvitation) {
    try {
      await navigator.clipboard.writeText(invitation.url)
      setCopiedToken(invitation.token)
    } catch {
      setError('링크를 자동으로 복사하지 못했습니다. 브라우저 권한을 확인해 주세요.')
    }
  }

  async function handleRemove() {
    const token = getAuthSession()?.accessToken
    const organizationId = data?.organization.organizationId
    if (!token || !organizationId || !removeTarget || removing) return

    setRemoving(true)
    setRemoveError(undefined)
    try {
      await removeOrganizationMember(organizationId, removeTarget.userId, token)
      setRemoveTarget(undefined)
      await loadOrganization(false)
    } catch (cause) {
      setRemoveError(cause instanceof Error ? cause.message : '구성원 소속 해제에 실패했습니다.')
    } finally {
      setRemoving(false)
    }
  }

  if (loading) {
    return <p className="py-10 text-[var(--color-text-secondary)]">조직 정보를 불러오는 중입니다.</p>
  }

  // dc의 "활성 상태인 구성원만 표시됩니다."와 실제 목록을 일치시킨다.
  const members = data?.members.filter((member) => member.status === 'ACTIVE') ?? []
  const influencerCount = members.filter((member) => member.userRole !== 'MANAGER').length
  const managerCount = members.filter((member) => member.userRole === 'MANAGER').length
  const pendingCount = invitations.filter((invitation) => !isExpired(invitation, now)).length

  return (
    <div className="pb-10">
      {error ? (
        <AlertBanner className="mb-6" title="조직 요청 실패" variant="error">
          {error}
        </AlertBanner>
      ) : null}

      {!data ? (
        <div className="max-w-[560px] py-10 sm:py-16">
          <h1 className="text-[25px] font-black tracking-[-0.035em] text-[var(--color-text-primary)]">
            조직 관리
          </h1>
          <p className="mt-2.5 text-base font-medium leading-[1.7] text-[var(--color-text-body)]">
            아직 소속된 조직이 없습니다. 조직을 만들면 인플루언서를 초대하고 팬미팅 운영을 함께
            관리할 수 있어요.
          </p>

          <form
            className="mt-[30px] grid gap-5 border-t border-[var(--color-divider)] pt-[26px]"
            onSubmit={handleCreate}
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label="조직 이름"
                onChange={(event) => setField('name', event.currentTarget.value)}
                placeholder="예: MELLY 엔터테인먼트"
                required
                value={form.name}
              />
              <TextField
                label="사업자등록번호"
                onChange={(event) => setField('businessNumber', event.currentTarget.value)}
                required
                value={form.businessNumber}
              />
              <TextField
                label="대표자명"
                onChange={(event) => setField('representativeName', event.currentTarget.value)}
                required
                value={form.representativeName}
              />
              <TextField
                label="대표 이메일"
                onChange={(event) => setField('contactEmail', event.currentTarget.value)}
                required
                type="email"
                value={form.contactEmail}
              />
              <TextField
                label="대표 전화번호"
                onChange={(event) => setField('contactPhone', event.currentTarget.value)}
                required
                value={form.contactPhone}
              />
            </div>
            <Textarea
              label="조직 설명"
              onChange={(event) => setField('description', event.currentTarget.value)}
              rows={4}
              value={form.description}
            />
            <div>
              <Button className="min-h-[52px] px-6" disabled={!requiredFilled} loading={creating} type="submit">
                조직 만들기
              </Button>
              {!requiredFilled ? (
                <p className="mt-2 text-sm font-medium text-[var(--color-text-tertiary)]">
                  필수 항목을 모두 입력하면 만들 수 있어요.
                </p>
              ) : null}
            </div>
          </form>
          <p className="mt-3 text-sm font-medium leading-[1.6] text-[var(--color-text-tertiary)]">
            조직을 만들면 내가 관리자로 함께 등록됩니다.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--color-text-tertiary)]">조직 관리</p>
              <h1 className="mt-2 text-[25px] font-black tracking-[-0.035em] text-[var(--color-text-primary)]">
                {data.organization.name}
              </h1>
              <p className="mt-[7px] text-[15px] font-medium text-[var(--color-text-tertiary)]">
                조직에 소속된 인플루언서와 관리자를 확인하고 초대하세요.
              </p>
            </div>
            <button
              className="mj-font-emphasis min-h-12 whitespace-nowrap rounded-lg border border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] px-5 text-[15px] text-white transition-colors hover:bg-[var(--color-primary-coral-hover)]"
              onClick={() => {
                setInviteServerError(undefined)
                setInviteOpen(true)
              }}
              type="button"
            >
              인플루언서 초대
            </button>
          </div>

          <section
            aria-label="조직 현황"
            className="mt-[22px] grid grid-cols-2 border-y border-[var(--color-divider)] md:grid-cols-4"
          >
            {(
              [
                { label: '전체 구성원', value: `${members.length}명`, highlight: false },
                { label: '인플루언서', value: `${influencerCount}명`, highlight: false },
                { label: '매니저', value: `${managerCount}명`, highlight: false },
                { label: '초대 대기', value: `${pendingCount}건`, highlight: pendingCount > 0 },
              ] as const
            ).map((cell, index) => (
              <div
                className={`px-5 py-4 first:pl-0 md:last:pr-0 ${index % 2 === 1 ? 'border-l border-[var(--color-divider)]' : ''} ${index >= 2 ? 'max-md:border-t max-md:border-[var(--color-divider)]' : ''} ${index === 2 ? 'max-md:pl-0' : ''} ${index >= 1 ? 'md:border-l md:border-[var(--color-divider)]' : ''}`}
                key={cell.label}
              >
                <p className="text-[13px] font-bold text-[var(--color-text-tertiary)]">
                  {cell.label}
                </p>
                <p
                  className={`mt-1.5 text-[22px] font-black tabular-nums ${cell.highlight ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-primary)]'}`}
                >
                  {cell.value}
                </p>
              </div>
            ))}
          </section>

          <div className="mt-[26px] grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
            <div className="min-w-0">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-lg font-extrabold tracking-[-0.028em]">구성원</h2>
                  <p className="mt-1 text-sm font-medium text-[var(--color-text-tertiary)]">
                    활성 상태인 구성원만 표시됩니다.
                  </p>
                </div>
                <p className="whitespace-nowrap text-[15px] font-extrabold tabular-nums">
                  {members.length}명
                </p>
              </div>

              <div aria-label="조직 구성원 목록" className="mt-4" role="table">
                <div
                  className="hidden gap-4 border-b border-[var(--color-border-control)] pb-2.5 md:grid md:grid-cols-[minmax(0,1fr)_110px_130px_88px]"
                  role="row"
                >
                  {['구성원', '역할', '합류일', '관리'].map((label, index) => (
                    <span
                      className={`text-[13px] font-bold text-[var(--color-text-tertiary)] ${index === 3 ? 'text-right' : ''}`}
                      key={label}
                      role="columnheader"
                    >
                      {label}
                    </span>
                  ))}
                </div>
                {members.map((member) => {
                  const isSelf = member.userId === sessionUserId
                  return (
                    <div
                      className={`grid grid-cols-2 items-center gap-2 border-b border-[var(--color-border-row)] py-3.5 md:grid-cols-[minmax(0,1fr)_110px_130px_88px] md:gap-4 ${isSelf ? 'bg-[var(--color-surface-subtle)]' : ''}`}
                      key={member.organizationMemberId}
                      role="row"
                    >
                      <div className="min-w-0 max-md:col-span-2" role="cell">
                        <strong className="block text-base font-extrabold text-[var(--color-text-primary)]">
                          {member.nickname}
                        </strong>
                        <span className="mt-1 block text-sm font-medium text-[var(--color-text-tertiary)] [overflow-wrap:anywhere]">
                          회원번호 {member.userId}
                        </span>
                      </div>
                      <span
                        className={`text-[15px] font-extrabold ${member.userRole === 'MANAGER' ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-primary-coral)]'}`}
                        role="cell"
                      >
                        {roleLabels[member.userRole] ?? member.userRole}
                      </span>
                      <span
                        className="text-[15px] font-semibold tabular-nums text-[var(--color-text-tertiary)] max-md:hidden"
                        role="cell"
                      >
                        {formatDate(member.joinedAt)}
                      </span>
                      <div className="text-right" role="cell">
                        <button
                          aria-label={
                            isSelf ? '본인은 소속을 해제할 수 없습니다' : `${member.nickname} 소속 해제`
                          }
                          className={`min-h-10 whitespace-nowrap rounded-lg border bg-white px-3 text-sm font-bold ${
                            isSelf
                              ? 'cursor-not-allowed border-[var(--color-divider)] text-[var(--color-text-tertiary)]'
                              : 'border-[var(--color-border-control)] text-[var(--color-error)] transition-colors hover:border-[var(--color-error)]'
                          }`}
                          disabled={isSelf}
                          onClick={() => {
                            setRemoveError(undefined)
                            setRemoveTarget(member)
                          }}
                          type="button"
                        >
                          소속 해제
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="mt-3.5 text-sm font-medium leading-[1.6] text-[var(--color-text-tertiary)]">
                본인은 소속을 해제할 수 없습니다. 해제된 구성원은 기록에 남으며 다시 초대할 수
                있어요.
              </p>
            </div>

            <aside
              aria-labelledby="og-invites"
              className="min-w-0 rounded-[10px] border border-[var(--color-divider)] p-5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[17px] font-extrabold tracking-[-0.028em]" id="og-invites">
                  보낸 초대
                </h2>
                <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-[var(--color-text-tertiary)]">
                  {pendingCount}건
                </span>
              </div>

              {invitations.length === 0 ? (
                <p
                  className="mt-4 rounded-lg border border-dashed border-[var(--color-border-control)] px-4 py-8 text-center text-[15px] font-medium leading-[1.6] text-[var(--color-text-tertiary)]"
                  role="status"
                >
                  대기 중인 초대가 없습니다.
                </p>
              ) : (
                <>
                  <div className="mt-3.5 grid gap-2">
                    {invitations.map((invitation) => {
                      const expired = isExpired(invitation, now)
                      return (
                        <div
                          className={`rounded-lg border px-[15px] py-3.5 ${
                            expired
                              ? 'border-[var(--color-divider)] bg-[var(--color-surface-subtle)]'
                              : 'border-[var(--color-primary-coral-soft-border)] bg-[var(--color-primary-coral-soft)]'
                          }`}
                          key={invitation.token}
                        >
                          <div className="flex items-baseline justify-between gap-3">
                            <strong className="text-[15px] font-extrabold text-[var(--color-text-primary)] [overflow-wrap:anywhere]">
                              회원번호 {invitation.influencerId}
                            </strong>
                            <span
                              className={`whitespace-nowrap text-[13px] font-extrabold ${expired ? 'text-[var(--color-text-tertiary)]' : 'text-[var(--color-warning)]'}`}
                            >
                              {expired ? '만료' : '대기'}
                            </span>
                          </div>
                          <p className="mt-[7px] text-sm font-medium leading-[1.55] tabular-nums text-[var(--color-text-tertiary)]">
                            {formatDateTime(invitation.expiresAt)} {expired ? '만료됨' : '만료'}
                          </p>
                          <div className="mt-3 flex gap-2">
                            <button
                              className="min-h-10 whitespace-nowrap rounded-lg border border-[var(--color-border-control)] bg-white px-[13px] text-sm font-bold transition-colors hover:border-[var(--color-primary-coral)] hover:text-[var(--color-primary-coral)] disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={reissuingId !== undefined}
                              onClick={() => void handleReissue(invitation)}
                              type="button"
                            >
                              {reissuingId === invitation.influencerId
                                ? '재발급 중…'
                                : reissuedToken === invitation.token
                                  ? '재발급됨'
                                  : '링크 재발급'}
                            </button>
                            <button
                              className="min-h-10 whitespace-nowrap rounded-lg border border-[var(--color-border-control)] bg-white px-[13px] text-sm font-bold transition-colors hover:border-[var(--color-text-tertiary)]"
                              onClick={() => void handleCopy(invitation)}
                              type="button"
                            >
                              {copiedToken === invitation.token ? '복사됨' : '링크 복사'}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <p className="mt-3.5 text-[13px] font-medium leading-[1.55] text-[var(--color-text-tertiary)]">
                    초대 링크는 표시된 만료 시각까지 한 번만 사용할 수 있습니다. 재발급하면 새
                    링크를 전달해 주세요.
                  </p>
                </>
              )}
            </aside>
          </div>
        </>
      )}

      <Dialog
        description="초대 링크가 일회성 토큰으로 발급됩니다. 링크를 대상 인플루언서에게 직접 전달해 주세요."
        footer={
          <>
            <Button disabled={sending} onClick={() => setInviteOpen(false)} variant="secondary">
              취소
            </Button>
            <Button
              disabled={!inviteIdValid}
              loading={sending}
              onClick={() => void handleSendInvite()}
            >
              초대 보내기
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!open && !sending) setInviteOpen(false)
        }}
        open={inviteOpen}
        title="인플루언서 초대"
      >
        <div className="grid gap-2">
          <TextField
            error={inviteInputError}
            label="인플루언서 회원번호"
            min={1}
            onChange={(event) => {
              setInviteId(event.currentTarget.value)
              setInviteTouched(true)
            }}
            placeholder="예: 42"
            required
            type="number"
            value={inviteId}
          />
          {!inviteIdValid && !inviteInputError ? (
            <p className="text-sm font-medium text-[var(--color-text-tertiary)]">
              인플루언서 프로필의 회원번호를 입력하면 보낼 수 있어요.
            </p>
          ) : null}
          {inviteServerError ? (
            <p className="text-sm font-bold text-[var(--color-error)]" role="alert">
              {inviteServerError}
            </p>
          ) : null}
        </div>
      </Dialog>

      <Dialog
        description="진행 중이거나 예정된 팬미팅 담당에서 제외됩니다. 기록은 남으며 다시 초대할 수 있습니다."
        footer={
          <>
            <Button disabled={removing} onClick={() => setRemoveTarget(undefined)} variant="secondary">
              취소
            </Button>
            <Button loading={removing} onClick={() => void handleRemove()} variant="danger">
              소속 해제
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!open && !removing) setRemoveTarget(undefined)
        }}
        open={removeTarget !== undefined}
        title={`${removeTarget?.nickname ?? '구성원'} 님의 소속을 해제할까요?`}
      >
        {removeError ? (
          <AlertBanner title="소속 해제 실패" variant="error">
            {removeError}
          </AlertBanner>
        ) : null}
      </Dialog>
    </div>
  )
}
