import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { parseServerDate } from '../../api/serverTime'
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
import { translate, useTranslation } from '../../i18n'

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
  const date = parseServerDate(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`
}

/** 2026.08.03 14:20 — 초대 만료 시각 표기다. */
function formatDateTime(value: string): string {
  const date = parseServerDate(value)
  if (Number.isNaN(date.getTime())) return value
  return `${formatDate(value)} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function isExpired(invitation: IssuedInvitation, now: number): boolean {
  const expiry = parseServerDate(invitation.expiresAt).getTime()
  return Number.isFinite(expiry) && expiry <= now
}

/**
 * 구성원 목록 정렬 기준이다. 매니저를 먼저 놓고, 같은 역할 안에서는 먼저 합류한 순으로 세운다.
 *
 * 서버 순서를 그대로 쓰면 매니저와 인플루언서가 섞여 누가 조직을 관리하는지 한눈에 들어오지 않고,
 * 구성원이 늘 때마다 줄 위치가 바뀌어 같은 사람을 다시 찾기 어려웠다.
 *
 * @param left 비교할 구성원
 * @param right 비교 대상 구성원
 * @return 정렬에 쓰는 비교 결과다. 날짜를 읽을 수 없으면 순서를 바꾸지 않는다.
 */
function compareMembers(left: OrganizationMember, right: OrganizationMember): number {
  const leftIsManager = left.userRole === 'MANAGER'
  if (leftIsManager !== (right.userRole === 'MANAGER')) return leftIsManager ? -1 : 1

  const leftJoined = parseServerDate(left.joinedAt).getTime()
  const rightJoined = parseServerDate(right.joinedAt).getTime()
  if (Number.isNaN(leftJoined) || Number.isNaN(rightJoined)) return 0
  return leftJoined - rightJoined
}

const roleLabels = (): Record<string, string> => ({
  MANAGER: translate('managerOrganizationPage.t69'),
  INFLUENCER: translate('managerOrganizationPage.t70'),
  SOLO_INFLUENCER: translate('managerOrganizationPage.t71'),
})

/**
 * 매니저의 조직 생성, 구성원 관리, 인플루언서 초대 화면이다.
 * (Manager Organization.dc.html — no-org·default·no-invites·invite-error 상태)
 *
 * 초대는 이메일이 아니라 회원번호 기반 API만 있고, 보낸 초대 목록 API가 없어
 * 이 세션에서 발급한 초대만 우측 패널에 표시한다.
 */
export function ManagerOrganizationPage() {
  const { t } = useTranslation()
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

  // dc의 "활성 상태인 구성원만 표시됩니다."와 실제 목록을 일치시킨다.
  // 초대 중복 검사가 이 목록을 쓰므로 렌더 분기보다 앞에서 만든다.
  const members = (data?.members ?? [])
    .filter((member) => member.status === 'ACTIVE')
    .sort(compareMembers)

  /**
   * 조직 정보를 읽는다.
   *
   * @param showSpinner false면 화면 깜빡임 없이 조용히 갱신한다(백그라운드 동기화용).
   * @param signal 폴링이 중단될 때 요청을 취소하기 위한 signal이다.
   */
  const loadOrganization = useCallback(async (showSpinner = true, signal?: AbortSignal) => {
    const token = getAuthSession()?.accessToken
    if (!token) {
      setError(t('managerOrganizationPage.t42'))
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
      setError(cause instanceof Error ? cause.message : t('managerOrganizationPage.t43'))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setError(cause instanceof Error ? cause.message : t('managerOrganizationPage.t44'))
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
  // 이미 소속된 회원번호는 백엔드가 거절한다. 보내기 전에 같은 사실을 입력란에서 알려 준다.
  const alreadyMember = inviteIdValid && members.some((member) => member.userId === inviteIdNumber)
  const inviteInputError =
    inviteTouched && inviteId.trim() !== '' && !inviteIdValid
      ? t('managerOrganizationPage.t45')
      : alreadyMember
        ? t('managerOrganizationPage.t80')
        : undefined

  async function handleSendInvite() {
    if (!inviteIdValid || alreadyMember || sending) return

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
        cause instanceof Error ? cause.message : t('managerOrganizationPage.t46'),
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
      setError(cause instanceof Error ? cause.message : t('managerOrganizationPage.t47'))
    } finally {
      setReissuingId(undefined)
    }
  }

  /** 초대 대화상자를 연다. 상단 버튼과 빈 목록의 안내에서 같이 쓴다. */
  function openInviteDialog() {
    setInviteServerError(undefined)
    setInviteOpen(true)
  }

  async function handleCopy(invitation: IssuedInvitation) {
    try {
      await navigator.clipboard.writeText(invitation.url)
      setCopiedToken(invitation.token)
    } catch {
      setError(t('managerOrganizationPage.t48'))
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
      setRemoveError(cause instanceof Error ? cause.message : t('managerOrganizationPage.t49'))
    } finally {
      setRemoving(false)
    }
  }

  if (loading) {
    return <p className="py-10 text-[var(--color-text-secondary)]">{t('managerOrganizationPage.t1')}</p>
  }

  const influencerCount = members.filter((member) => member.userRole !== 'MANAGER').length
  const managerCount = members.filter((member) => member.userRole === 'MANAGER').length
  const pendingCount = invitations.filter((invitation) => !isExpired(invitation, now)).length

  return (
    <div className="pb-10">
      {error ? (
        <AlertBanner className="mb-6" title={t('managerOrganizationPage.t2')} variant="error">
          {error}
        </AlertBanner>
      ) : null}

      {!data ? (
        <div className="max-w-[560px] py-10 sm:py-16">
          <h1 className="text-[25px] font-black tracking-[-0.035em] text-[var(--color-text-primary)]">
            {t('managerOrganizationPage.t3')}
          </h1>
          <p className="mt-2.5 text-base font-medium leading-[1.7] text-[var(--color-text-body)]">
            {t('managerOrganizationPage.t4')}
          </p>

          <form
            className="mt-[30px] grid gap-5 border-t border-[var(--color-divider)] pt-[26px]"
            onSubmit={handleCreate}
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label={t('managerOrganizationPage.t5')}
                onChange={(event) => setField('name', event.currentTarget.value)}
                placeholder={t('managerOrganizationPage.t6')}
                required
                value={form.name}
              />
              <TextField
                label={t('managerOrganizationPage.t7')}
                onChange={(event) => setField('businessNumber', event.currentTarget.value)}
                required
                value={form.businessNumber}
              />
              <TextField
                label={t('managerOrganizationPage.t8')}
                onChange={(event) => setField('representativeName', event.currentTarget.value)}
                required
                value={form.representativeName}
              />
              <TextField
                label={t('managerOrganizationPage.t9')}
                onChange={(event) => setField('contactEmail', event.currentTarget.value)}
                required
                type="email"
                value={form.contactEmail}
              />
              <TextField
                label={t('managerOrganizationPage.t10')}
                onChange={(event) => setField('contactPhone', event.currentTarget.value)}
                required
                value={form.contactPhone}
              />
            </div>
            <Textarea
              label={t('managerOrganizationPage.t11')}
              onChange={(event) => setField('description', event.currentTarget.value)}
              rows={4}
              value={form.description}
            />
            <div>
              <Button className="min-h-[52px] px-6" disabled={!requiredFilled} loading={creating} type="submit">
                {t('managerOrganizationPage.t12')}
              </Button>
              {!requiredFilled ? (
                <p className="mt-2 text-sm font-medium text-[var(--color-text-tertiary)]">
                  {t('managerOrganizationPage.t13')}
                </p>
              ) : null}
            </div>
          </form>
          <p className="mt-3 text-sm font-medium leading-[1.6] text-[var(--color-text-tertiary)]">
            {t('managerOrganizationPage.t14')}
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--color-text-tertiary)]">{t('managerOrganizationPage.t15')}</p>
              <h1 className="mt-2 text-[25px] font-black tracking-[-0.035em] text-[var(--color-text-primary)]">
                {data.organization.name}
              </h1>
              <p className="mt-[7px] text-[15px] font-medium text-[var(--color-text-tertiary)]">
                {t('managerOrganizationPage.t16')}
              </p>
            </div>
            <button
              className="mj-font-emphasis min-h-12 whitespace-nowrap rounded-lg border border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] px-5 text-[15px] text-white transition-colors hover:bg-[var(--color-primary-coral-hover)]"
              onClick={openInviteDialog}
              type="button"
            >
              {t('managerOrganizationPage.t17')}
            </button>
          </div>

          <section
            aria-label={t('managerOrganizationPage.t18')}
            className="mt-[22px] grid grid-cols-2 border-y border-[var(--color-divider)] md:grid-cols-4"
          >
            {(
              [
                { label: t('managerOrganizationPage.t50'), value: t('managerOrganizationPage.t72', { p0: members.length }), highlight: false },
                { label: t('managerOrganizationPage.t51'), value: t('managerOrganizationPage.t73', { p0: influencerCount }), highlight: false },
                { label: t('managerOrganizationPage.t52'), value: t('managerOrganizationPage.t74', { p0: managerCount }), highlight: false },
                { label: t('managerOrganizationPage.t53'), value: t('managerOrganizationPage.t75', { p0: pendingCount }), highlight: pendingCount > 0 },
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
                  <h2 className="text-lg font-extrabold tracking-[-0.028em]">{t('managerOrganizationPage.t19')}</h2>
                  <p className="mt-1 text-sm font-medium text-[var(--color-text-tertiary)]">
                    {t('managerOrganizationPage.t20')}
                  </p>
                </div>
                <p className="whitespace-nowrap text-[15px] font-extrabold tabular-nums">
                  {members.length}{t('managerOrganizationPage.t21')}
                </p>
              </div>

              <div aria-label={t('managerOrganizationPage.t22')} className="mt-4" role="table">
                <div
                  className="hidden gap-4 border-b border-[var(--color-border-control)] pb-2.5 md:grid md:grid-cols-[minmax(0,1fr)_110px_130px_88px]"
                  role="row"
                >
                  {[t('managerOrganizationPage.t54'), t('managerOrganizationPage.t55'), t('managerOrganizationPage.t56'), t('managerOrganizationPage.t57')].map((label, index) => (
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
                          {t('managerOrganizationPage.t23')} {member.userId}
                        </span>
                      </div>
                      <span
                        className={`text-[15px] font-extrabold ${member.userRole === 'MANAGER' ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-primary-coral)]'}`}
                        role="cell"
                      >
                        {roleLabels()[member.userRole] ?? member.userRole}
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
                            isSelf ? t('managerOrganizationPage.t58') : t('managerOrganizationPage.t76', { p0: member.nickname })
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
                          {t('managerOrganizationPage.t24')}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* 조직을 막 만들면 매니저 본인만 남아 목록이 헤더뿐이라 다음 할 일이 보이지 않는다. */}
              {influencerCount === 0 ? (
                <div
                  className="mt-4 grid justify-items-center gap-3 rounded-lg border border-dashed border-[var(--color-border-control)] px-4 py-8 text-center"
                  role="status"
                >
                  <strong className="text-base font-extrabold text-[var(--color-text-primary)]">
                    {t('managerOrganizationPage.t78')}
                  </strong>
                  <p className="text-[15px] font-medium leading-[1.6] text-[var(--color-text-tertiary)]">
                    {t('managerOrganizationPage.t79')}
                  </p>
                  <button
                    className="mj-font-emphasis min-h-11 rounded-lg border border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] px-4 text-sm text-white transition-colors hover:bg-[var(--color-primary-coral-hover)]"
                    onClick={openInviteDialog}
                    type="button"
                  >
                    {t('managerOrganizationPage.t17')}
                  </button>
                </div>
              ) : null}
              <p className="mt-3.5 text-sm font-medium leading-[1.6] text-[var(--color-text-tertiary)]">
                {t('managerOrganizationPage.t25')}
              </p>
            </div>

            <aside
              aria-labelledby="og-invites"
              className="min-w-0 rounded-[10px] border border-[var(--color-divider)] p-5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[17px] font-extrabold tracking-[-0.028em]" id="og-invites">
                  {t('managerOrganizationPage.t26')}
                </h2>
                <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-[var(--color-text-tertiary)]">
                  {pendingCount}{t('managerOrganizationPage.t27')}
                </span>
              </div>

              {invitations.length === 0 ? (
                <div
                  className="mt-4 grid justify-items-center gap-3 rounded-lg border border-dashed border-[var(--color-border-control)] px-4 py-8 text-center"
                  role="status"
                >
                  <p className="text-[15px] font-medium leading-[1.6] text-[var(--color-text-tertiary)]">
                    {t('managerOrganizationPage.t28')}
                  </p>
                  <button
                    className="min-h-11 rounded-lg border border-[var(--color-border-control)] bg-white px-4 text-sm font-bold transition-colors hover:border-[var(--color-primary-coral)] hover:text-[var(--color-primary-coral)]"
                    onClick={openInviteDialog}
                    type="button"
                  >
                    {t('managerOrganizationPage.t17')}
                  </button>
                </div>
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
                              {t('managerOrganizationPage.t29')} {invitation.influencerId}
                            </strong>
                            <span
                              className={`whitespace-nowrap text-[13px] font-extrabold ${expired ? 'text-[var(--color-text-tertiary)]' : 'text-[var(--color-warning)]'}`}
                            >
                              {expired ? t('managerOrganizationPage.t59') : t('managerOrganizationPage.t60')}
                            </span>
                          </div>
                          <p className="mt-[7px] text-sm font-medium leading-[1.55] tabular-nums text-[var(--color-text-tertiary)]">
                            {formatDateTime(invitation.expiresAt)} {expired ? t('managerOrganizationPage.t61') : t('managerOrganizationPage.t62')}
                          </p>
                          <div className="mt-3 flex gap-2">
                            <button
                              className="min-h-10 whitespace-nowrap rounded-lg border border-[var(--color-border-control)] bg-white px-[13px] text-sm font-bold transition-colors hover:border-[var(--color-primary-coral)] hover:text-[var(--color-primary-coral)] disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={reissuingId !== undefined}
                              onClick={() => void handleReissue(invitation)}
                              type="button"
                            >
                              {reissuingId === invitation.influencerId
                                ? t('managerOrganizationPage.t63')
                                : reissuedToken === invitation.token
                                  ? t('managerOrganizationPage.t64')
                                  : t('managerOrganizationPage.t65')}
                            </button>
                            <button
                              className="min-h-10 whitespace-nowrap rounded-lg border border-[var(--color-border-control)] bg-white px-[13px] text-sm font-bold transition-colors hover:border-[var(--color-text-tertiary)]"
                              onClick={() => void handleCopy(invitation)}
                              type="button"
                            >
                              {copiedToken === invitation.token ? t('managerOrganizationPage.t66') : t('managerOrganizationPage.t67')}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              {/* 초대 규칙과, 초대 말고는 합류시킬 방법이 없다는 사실을 목록 유무와 상관없이 알린다. */}
              <p className="mt-3.5 border-t border-[var(--color-divider)] pt-3.5 text-[13px] font-medium leading-[1.55] text-[var(--color-text-tertiary)]">
                {t('managerOrganizationPage.t30')}
              </p>
              <p className="mt-2 text-[13px] font-medium leading-[1.55] text-[var(--color-text-tertiary)]">
                {t('managerOrganizationPage.t81')}
              </p>
            </aside>
          </div>
        </>
      )}

      <Dialog
        description={t('managerOrganizationPage.t31')}
        footer={
          <>
            <Button disabled={sending} onClick={() => setInviteOpen(false)} variant="secondary">
              {t('managerOrganizationPage.t32')}
            </Button>
            <Button
              disabled={!inviteIdValid || alreadyMember}
              loading={sending}
              onClick={() => void handleSendInvite()}
            >
              {t('managerOrganizationPage.t33')}
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!open && !sending) setInviteOpen(false)
        }}
        open={inviteOpen}
        title={t('managerOrganizationPage.t34')}
      >
        <div className="grid gap-2">
          <TextField
            error={inviteInputError}
            label={t('managerOrganizationPage.t35')}
            min={1}
            onChange={(event) => {
              setInviteId(event.currentTarget.value)
              setInviteTouched(true)
            }}
            placeholder={t('managerOrganizationPage.t36')}
            required
            type="number"
            value={inviteId}
          />
          {!inviteIdValid && !inviteInputError ? (
            <p className="text-sm font-medium text-[var(--color-text-tertiary)]">
              {t('managerOrganizationPage.t37')}
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
        description={t('managerOrganizationPage.t38')}
        footer={
          <>
            <Button disabled={removing} onClick={() => setRemoveTarget(undefined)} variant="secondary">
              {t('managerOrganizationPage.t39')}
            </Button>
            <Button loading={removing} onClick={() => void handleRemove()} variant="danger">
              {t('managerOrganizationPage.t40')}
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!open && !removing) setRemoveTarget(undefined)
        }}
        open={removeTarget !== undefined}
        title={t('managerOrganizationPage.t77', { p0: removeTarget?.nickname ?? t('managerOrganizationPage.t68') })}
      >
        <div className="grid gap-3">
          {removeError ? (
            <AlertBanner title={t('managerOrganizationPage.t41')} variant="error">
              {removeError}
            </AlertBanner>
          ) : null}
          {/* 목록에서 옆줄을 잘못 눌러도 알아채도록 대상의 회원번호·역할·합류일을 함께 보여 준다. */}
          {removeTarget ? (
            <div className="rounded-lg border border-[var(--color-divider)] bg-[var(--color-surface-subtle)] px-4 py-3">
              <strong className="block text-base font-extrabold text-[var(--color-text-primary)] [overflow-wrap:anywhere]">
                {removeTarget.nickname}
              </strong>
              <span className="mt-1 block text-sm font-medium text-[var(--color-text-tertiary)] [overflow-wrap:anywhere]">
                {t('managerOrganizationPage.t23')} {removeTarget.userId} ·{' '}
                {roleLabels()[removeTarget.userRole] ?? removeTarget.userRole} ·{' '}
                {t('managerOrganizationPage.t56')} {formatDate(removeTarget.joinedAt)}
              </span>
            </div>
          ) : null}
        </div>
      </Dialog>
    </div>
  )
}
