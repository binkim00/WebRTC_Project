import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import { acceptOrganizationInvitation, getMyOrganization } from '../../api/organizations'
import { AlertBanner } from '../../components/feedback/AlertBanner'
import { InvalidRouteState } from '../../components/routing/ScreenPage'
import { useTranslation } from '../../i18n'

type InvitationView = 'pending' | 'accepted' | 'expired' | 'conflict'

const cardClass = 'motion-safe:animate-[mj-settle-in_520ms_cubic-bezier(0.2,0.8,0.22,1)_both]'
const eyebrowClass = 'text-sm font-extrabold'
const bodyClass = 'mt-4 text-[17px] font-medium leading-[1.7] text-[var(--color-text-secondary)]'
const footnoteClass =
  'mt-6 border-t border-[var(--color-divider)] pt-5 text-[15px] font-medium leading-[1.6] text-[var(--color-text-tertiary)]'

/** 수락 실패 응답을 만료·소속 충돌 화면으로 분류한다. 둘 다 아니면 pending에 오류 배너만 띄운다. */
function classifyAcceptFailure(reason: unknown): InvitationView | undefined {
  if (!(reason instanceof ApiError)) return undefined
  if (reason.status === 409 || reason.message.includes('소속')) return 'conflict'
  if (
    reason.status === 404 ||
    reason.status === 410 ||
    reason.message.includes('만료') ||
    reason.message.includes('유효하지 않') ||
    reason.message.includes('사용')
  ) {
    return 'expired'
  }
  return undefined
}

/**
 * 초대 링크를 받은 인플루언서가 조직 가입을 확정하는 화면이다.
 * (Influencer Invitation.dc.html — pending·accepted·expired·conflict 4상태)
 *
 * 초대 상세 조회 API가 없어 조직명·초대자·만료 시각은 수락 전에 알 수 없고,
 * 만료·소속 충돌 여부도 수락 응답으로만 판별된다.
 */
export function InfluencerOrganizationInvitationPage() {
  const { t } = useTranslation()
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [view, setView] = useState<InvitationView>('pending')
  const [organizationName, setOrganizationName] = useState('')
  const [currentOrganizationName, setCurrentOrganizationName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()

  if (!token?.trim()) {
    return (
      <InvalidRouteState
        message={t('influencerOrganizationInvitationPage.t1')}
        title={t('influencerOrganizationInvitationPage.t2')}
      />
    )
  }

  async function handleAccept() {
    const authToken = getAuthSession()?.accessToken
    if (!authToken) {
      setError('초대를 수락하려면 인플루언서 계정으로 로그인해 주세요.')
      return
    }

    setSubmitting(true)
    setError(undefined)
    try {
      const response = await acceptOrganizationInvitation(token ?? '', authToken)
      setOrganizationName(response.organization.name)
      setView('accepted')
    } catch (reason) {
      const failureView = classifyAcceptFailure(reason)
      if (failureView === 'conflict') {
        // 충돌 화면에는 현재 소속 조직명을 보여 준다. 조회 실패 시 이름 없이 안내한다.
        try {
          const mine = await getMyOrganization(authToken)
          setCurrentOrganizationName(mine?.organization.name ?? '')
        } catch {
          setCurrentOrganizationName('')
        }
      }
      if (failureView) {
        setView(failureView)
      } else {
        setError(reason instanceof Error ? reason.message : '조직 초대 수락에 실패했습니다.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  function handleLater() {
    if (window.history.length > 1) navigate(-1)
    else navigate('/influencer/mypage/fan-meetings')
  }

  return (
    <div className="mx-auto w-full max-w-[720px] pb-16 pt-10 sm:pt-14">
      {view === 'pending' ? (
        <div className={cardClass}>
          <p className={`${eyebrowClass} text-[var(--color-primary-coral)]`}>{t('influencerOrganizationInvitationPage.t3')}</p>
          <h1 className="mt-3.5 text-[32px] font-black leading-[1.14] tracking-[-0.045em] text-[var(--color-text-primary)] [text-wrap:balance]">
            {t('influencerOrganizationInvitationPage.t4')}
          </h1>
          <p className={bodyClass}>
            {t('influencerOrganizationInvitationPage.t5')}
          </p>

          <dl className="mt-[30px] grid border-t border-[var(--color-divider)] pt-[9px]">
            <div className="flex items-baseline justify-between gap-5 border-b border-[var(--color-border-row)] py-[13px]">
              <dt className="text-[15px] font-semibold text-[var(--color-text-tertiary)]">
                {t('influencerOrganizationInvitationPage.t6')}
              </dt>
              <dd className="m-0 text-base font-extrabold text-[var(--color-primary-coral)]">
                {t('influencerOrganizationInvitationPage.t7')}
              </dd>
            </div>
          </dl>

          {error ? (
            <div className="mt-5">
              <AlertBanner title={t('influencerOrganizationInvitationPage.t8')} variant="error">
                {error}
              </AlertBanner>
            </div>
          ) : null}

          <div className="mt-7 grid gap-3 sm:grid-cols-[1fr_auto]">
            <button
              className="mj-font-emphasis min-h-14 rounded-[10px] border border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] text-[17px] text-white shadow-[0_12px_28px_rgb(201_54_52/20%)] transition-colors hover:bg-[var(--color-primary-coral-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting}
              onClick={() => void handleAccept()}
              type="button"
            >
              {submitting ? '수락 처리 중…' : '초대 수락하기'}
            </button>
            <button
              className="min-h-14 whitespace-nowrap rounded-[10px] border border-[var(--color-border-control)] bg-white px-[22px] text-base font-bold text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-text-tertiary)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting}
              onClick={handleLater}
              type="button"
            >
              {t('influencerOrganizationInvitationPage.t9')}
            </button>
          </div>
          <p className="mt-[13px] text-sm font-medium leading-[1.6] text-[var(--color-text-tertiary)]">
            {t('influencerOrganizationInvitationPage.t10')}
          </p>
        </div>
      ) : null}

      {view === 'accepted' ? (
        <div className={cardClass} role="status">
          <p className={`${eyebrowClass} text-[var(--color-success)]`}>{t('influencerOrganizationInvitationPage.t11')}</p>
          <h1 className="mt-3.5 text-[32px] font-black leading-[1.14] tracking-[-0.045em] text-[var(--color-text-primary)]">
            {organizationName}{t('influencerOrganizationInvitationPage.t12')}
          </h1>
          <p className={bodyClass}>
            {t('influencerOrganizationInvitationPage.t13')}
          </p>
          <Link
            className="mj-font-emphasis mt-7 inline-flex min-h-[54px] items-center rounded-[10px] bg-[var(--color-primary-coral)] px-6 text-base text-white transition-colors hover:bg-[var(--color-primary-coral-hover)]"
            to="/influencer/mypage/fan-meetings"
          >
            {t('influencerOrganizationInvitationPage.t14')}
          </Link>
        </div>
      ) : null}

      {view === 'expired' ? (
        <div className={cardClass} role="alert">
          <p className={`${eyebrowClass} text-[var(--color-text-tertiary)]`}>{t('influencerOrganizationInvitationPage.t15')}</p>
          <h1 className="mt-3.5 text-[30px] font-black leading-[1.16] tracking-[-0.045em] text-[var(--color-text-primary)]">
            {t('influencerOrganizationInvitationPage.t16')}
          </h1>
          <p className={bodyClass}>
            {t('influencerOrganizationInvitationPage.t17')}
          </p>
          <p className={footnoteClass}>{t('influencerOrganizationInvitationPage.t18')}</p>
        </div>
      ) : null}

      {view === 'conflict' ? (
        <div className={cardClass} role="alert">
          <p className={`${eyebrowClass} text-[var(--color-warning)]`}>{t('influencerOrganizationInvitationPage.t19')}</p>
          <h1 className="mt-3.5 text-[30px] font-black leading-[1.16] tracking-[-0.045em] text-[var(--color-text-primary)]">
            {t('influencerOrganizationInvitationPage.t20')}
          </h1>
          <p className={bodyClass}>
            {t('influencerOrganizationInvitationPage.t21')}{' '}
            {currentOrganizationName ? (
              <>
                <strong className="font-extrabold text-[var(--color-text-primary)]">
                  {currentOrganizationName}
                </strong>
                {t('influencerOrganizationInvitationPage.t22')}
              </>
            ) : (
              '다른 조직에'
            )}{' '}
            {t('influencerOrganizationInvitationPage.t23')}
          </p>
          <p className={footnoteClass}>{t('influencerOrganizationInvitationPage.t24')}</p>
        </div>
      ) : null}
    </div>
  )
}
