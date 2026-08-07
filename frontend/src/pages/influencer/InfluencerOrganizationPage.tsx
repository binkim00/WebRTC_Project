import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAuthSession } from '../../api/authSession'
import {
  getMyOrganization,
  type MyOrganizationMembers,
  type OrganizationMember,
} from '../../api/organizations'
import { parseServerDate } from '../../api/serverTime'
import { AlertBanner } from '../../components/feedback/AlertBanner'
import { usePolling } from '../../hooks/usePolling'
import { useTranslation } from '../../i18n'

/** 두 자리로 맞춘다. 날짜 표기에서만 쓴다. */
function pad(value: number) {
  return String(value).padStart(2, '0')
}

/** 2026.03.02 — 합류일·개설일 표기다. */
function formatDate(value: string): string {
  const date = parseServerDate(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`
}

/**
 * 인플루언서가 자기 소속 조직과 담당 매니저를 확인하는 화면이다.
 *
 * 지금까지 조직 화면은 매니저 전용(`/manager/organization`)뿐이었고 MANAGE_ORGANIZATION
 * 권한도 MANAGER에게만 있어, 인플루언서는 자기가 어느 조직에 속해 있고 누가 자기 매니저인지
 * 확인할 방법이 없었다.
 *
 * `GET /api/v1/organizations/me/members` 하나로 조직과 활성 구성원을 모두 읽는다.
 * 이 API는 인증만 되면 호출할 수 있고(SecurityConfig에 별도 제한 없음), 활성 소속이 없으면
 * 400을 주므로 api 계층이 null로 바꿔 준다.
 *
 * **읽기 전용 화면이다.** 초대 수락은 초대 링크 화면(`/influencer/organization/invitations/:token`)이,
 * 소속 해제는 매니저 화면이 담당한다. 인플루언서가 스스로 조직을 떠나는 API는 없다.
 */
export function InfluencerOrganizationPage() {
  const { t } = useTranslation()
  const session = getAuthSession()
  const [data, setData] = useState<MyOrganizationMembers | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  /**
   * 조직 정보를 읽는다.
   *
   * @param showSpinner false면 화면 깜빡임 없이 조용히 갱신한다(백그라운드 동기화용).
   * @param signal 폴링이 중단될 때 요청을 취소하기 위한 signal이다.
   */
  const loadOrganization = useCallback(async (showSpinner = true, signal?: AbortSignal) => {
    const token = getAuthSession()?.accessToken
    if (!token) {
      setError(t('influencerOrganizationPage.t5'))
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
      setError(cause instanceof Error ? cause.message : t('influencerOrganizationPage.t3'))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** usePolling에 넘길 백그라운드 동기화 함수다. 스피너를 띄우지 않는다. */
  const syncOrganization = useCallback(
    (signal: AbortSignal) => loadOrganization(false, signal),
    [loadOrganization],
  )

  // 최초 진입에서는 스피너와 함께 읽는다.
  useEffect(() => {
    void loadOrganization()
  }, [loadOrganization])

  // 다른 탭에서 초대를 수락하거나 매니저가 소속을 해제하면 이 화면도 따라가야 한다.
  // 매니저 화면과 달리 이 화면에서 바뀌는 값이 없으므로 주기는 길게 두고 포커스 복귀에 기댄다.
  usePolling(syncOrganization, {
    intervalMs: 60_000,
    immediate: false,
    refreshOnFocus: true,
  })

  if (loading) {
    return (
      <p className="py-10 text-[var(--color-text-secondary)]" role="status">
        {t('influencerOrganizationPage.t1')}
      </p>
    )
  }

  // 백엔드가 ACTIVE만 내려주지만, 매니저 화면과 같은 기준으로 한 번 더 거른다.
  const members = data?.members.filter((member) => member.status === 'ACTIVE') ?? []
  const managers = members.filter((member) => member.userRole === 'MANAGER')
  const peers = members.filter((member) => member.userRole !== 'MANAGER')
  const me = members.find((member) => member.userId === session?.userId)

  return (
    <div className="mx-auto w-full max-w-[960px] pb-10">
      {error ? (
        <AlertBanner className="mb-6" title={t('influencerOrganizationPage.t2')} variant="error">
          <div className="grid justify-items-start gap-2">
            <p>{error}</p>
            <button
              className="min-h-9 rounded-lg border border-current px-3 text-sm font-bold"
              onClick={() => void loadOrganization()}
              type="button"
            >
              {t('influencerOrganizationPage.t4')}
            </button>
          </div>
        </AlertBanner>
      ) : null}

      {!data ? (
        <div className="max-w-[620px] py-6 sm:py-10">
          <h1 className="text-[25px] font-black tracking-[-0.035em] text-[var(--color-text-primary)]">
            {session?.role === 'SOLO_INFLUENCER'
              ? t('influencerOrganizationPage.t8')
              : t('influencerOrganizationPage.t6')}
          </h1>
          <p className="mt-2.5 text-base font-medium leading-[1.7] text-[var(--color-text-body)]">
            {session?.role === 'SOLO_INFLUENCER'
              ? t('influencerOrganizationPage.t9')
              : t('influencerOrganizationPage.t7')}
          </p>
          <Link
            className="mj-font-emphasis mt-7 inline-flex min-h-[52px] items-center rounded-[10px] border border-[var(--color-border-control)] bg-white px-5 text-[15px] text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-primary-coral)] hover:text-[var(--color-primary-coral)]"
            to="/influencer/fan-meetings"
          >
            {t('influencerOrganizationPage.t10')}
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
            {data.organization.logoUrl ? (
              <img
                alt={t('influencerOrganizationPage.t32')}
                className="size-16 shrink-0 rounded-[14px] border border-[var(--color-divider)] object-cover"
                decoding="async"
                src={data.organization.logoUrl}
              />
            ) : null}
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--color-text-tertiary)]">
                {t('influencerOrganizationPage.t11')}
              </p>
              <h1 className="mt-2 text-[25px] font-black tracking-[-0.035em] text-[var(--color-text-primary)]">
                {data.organization.name}
              </h1>
            </div>
          </div>

          <section
            aria-label={t('influencerOrganizationPage.t33')}
            className="mt-[22px] grid grid-cols-3 border-y border-[var(--color-divider)]"
          >
            {(
              [
                {
                  label: t('influencerOrganizationPage.t12'),
                  value: me ? formatDate(me.joinedAt) : '-',
                },
                {
                  label: t('influencerOrganizationPage.t13'),
                  value: t('influencerOrganizationPage.t15', { p0: members.length }),
                },
                {
                  label: t('influencerOrganizationPage.t14'),
                  value: t('influencerOrganizationPage.t15', { p0: managers.length }),
                },
              ] as const
            ).map((cell, index) => (
              <div
                className={`px-5 py-4 first:pl-0 last:pr-0 ${index >= 1 ? 'border-l border-[var(--color-divider)]' : ''}`}
                key={cell.label}
              >
                <p className="text-[13px] font-bold text-[var(--color-text-tertiary)]">
                  {cell.label}
                </p>
                <p className="mt-1.5 text-[22px] font-black tabular-nums text-[var(--color-text-primary)]">
                  {cell.value}
                </p>
              </div>
            ))}
          </section>

          <div className="mt-[26px] grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold tracking-[-0.028em]">
                {t('influencerOrganizationPage.t16')}
              </h2>
              <p className="mt-1 text-sm font-medium text-[var(--color-text-tertiary)]">
                {t('influencerOrganizationPage.t17')}
              </p>

              {managers.length === 0 ? (
                <p
                  className="mt-4 rounded-lg border border-dashed border-[var(--color-border-control)] px-4 py-8 text-center text-[15px] font-medium leading-[1.6] text-[var(--color-text-tertiary)]"
                  role="status"
                >
                  {t('influencerOrganizationPage.t18')}
                </p>
              ) : (
                <ul className="mt-4 grid gap-2.5">
                  {managers.map((manager) => (
                    <MemberRow
                      highlight
                      key={manager.organizationMemberId}
                      member={manager}
                      roleLabel={t('influencerOrganizationPage.t14')}
                    />
                  ))}
                </ul>
              )}

              <h2 className="mt-9 text-lg font-extrabold tracking-[-0.028em]">
                {t('influencerOrganizationPage.t26')}
              </h2>
              {peers.length === 0 ? (
                <p
                  className="mt-4 rounded-lg border border-dashed border-[var(--color-border-control)] px-4 py-8 text-center text-[15px] font-medium leading-[1.6] text-[var(--color-text-tertiary)]"
                  role="status"
                >
                  {t('influencerOrganizationPage.t27')}
                </p>
              ) : (
                <ul className="mt-4 grid gap-2.5">
                  {peers.map((peer) => (
                    <MemberRow
                      key={peer.organizationMemberId}
                      member={peer}
                      roleLabel={
                        peer.userId === session?.userId
                          ? t('influencerOrganizationPage.t30')
                          : undefined
                      }
                      self={peer.userId === session?.userId}
                    />
                  ))}
                </ul>
              )}

              <p className="mt-4 text-sm font-medium leading-[1.6] text-[var(--color-text-tertiary)]">
                {t('influencerOrganizationPage.t31')}
              </p>
            </div>

            <aside
              aria-labelledby="io-organization"
              className="min-w-0 rounded-[10px] border border-[var(--color-divider)] p-5"
            >
              <h2 className="text-[17px] font-extrabold tracking-[-0.028em]" id="io-organization">
                {t('influencerOrganizationPage.t19')}
              </h2>
              <dl className="mt-3.5 grid gap-0">
                {(
                  [
                    // 조직 생성 시 선택 입력이라 비어 있을 수 있다. 빈 자리는 줄을 지우지 않고 '-'로 남긴다.
                    {
                      label: t('influencerOrganizationPage.t20'),
                      value: data.organization.representativeName ?? '-',
                    },
                    {
                      label: t('influencerOrganizationPage.t21'),
                      value: data.organization.contactEmail ?? '-',
                    },
                    {
                      label: t('influencerOrganizationPage.t22'),
                      value: data.organization.contactPhone ?? '-',
                    },
                    {
                      label: t('influencerOrganizationPage.t23'),
                      value: formatDate(data.organization.createdAt),
                    },
                  ] as const
                ).map((row) => (
                  <div
                    className="grid gap-1 border-b border-[var(--color-border-row)] py-3 last:border-b-0 sm:grid-cols-[104px_minmax(0,1fr)] sm:items-baseline sm:gap-3"
                    key={row.label}
                  >
                    <dt className="text-[13px] font-bold text-[var(--color-text-tertiary)]">
                      {row.label}
                    </dt>
                    <dd className="m-0 text-[15px] font-semibold text-[var(--color-text-primary)] [overflow-wrap:anywhere]">
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>

              <h3 className="mt-5 text-[13px] font-bold text-[var(--color-text-tertiary)]">
                {t('influencerOrganizationPage.t24')}
              </h3>
              <p className="mt-1.5 text-[15px] font-medium leading-[1.65] text-[var(--color-text-body)] [overflow-wrap:anywhere]">
                {data.organization.description?.trim()
                  ? data.organization.description
                  : t('influencerOrganizationPage.t25')}
              </p>
            </aside>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * 조직 구성원 한 명을 보여 주는 줄이다. 매니저는 강조 배경으로 구분한다.
 *
 * @param member 표시할 활성 구성원
 * @param roleLabel 이름 옆 배지 문구다. 없으면 배지를 그리지 않는다.
 * @param highlight 담당 매니저처럼 눈에 먼저 들어와야 하는 줄이면 true
 * @param self 로그인한 본인 줄이면 true. 배경으로 구분한다.
 */
function MemberRow({
  member,
  roleLabel,
  highlight = false,
  self = false,
}: {
  member: OrganizationMember
  roleLabel?: string
  highlight?: boolean
  self?: boolean
}) {
  const { t } = useTranslation()
  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border px-4 py-3.5 ${
        highlight
          ? 'border-[var(--color-primary-coral-soft-border)] bg-[var(--color-primary-coral-soft)]'
          : self
            ? 'border-[var(--color-divider)] bg-[var(--color-surface-subtle)]'
            : 'border-[var(--color-divider)]'
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        {member.profileImageUrl ? (
          <img
            alt=""
            className="size-10 shrink-0 rounded-full border border-[var(--color-divider)] object-cover"
            decoding="async"
            loading="lazy"
            src={member.profileImageUrl}
          />
        ) : (
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full border border-[var(--color-divider)] bg-white text-sm font-black text-[var(--color-text-tertiary)]"
          >
            {member.nickname.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0">
          <strong className="flex flex-wrap items-center gap-2 text-base font-extrabold text-[var(--color-text-primary)]">
            <span className="[overflow-wrap:anywhere]">{member.nickname}</span>
            {roleLabel ? (
              <span className="rounded-full border border-current px-2 py-0.5 text-[12px] font-bold text-[var(--color-primary-coral)]">
                {roleLabel}
              </span>
            ) : null}
          </strong>
          <span className="mt-1 block text-sm font-medium text-[var(--color-text-tertiary)] [overflow-wrap:anywhere]">
            {t('influencerOrganizationPage.t28')} {member.userId}
          </span>
        </div>
      </div>
      <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-[var(--color-text-tertiary)]">
        {t('influencerOrganizationPage.t29')} {formatDate(member.joinedAt)}
      </span>
    </li>
  )
}
