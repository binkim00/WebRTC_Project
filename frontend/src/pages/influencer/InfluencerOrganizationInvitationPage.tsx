import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import { acceptOrganizationInvitation, getMyOrganization } from '../../api/organizations'
import { AlertBanner } from '../../components/feedback/AlertBanner'
import { InvalidRouteState } from '../../components/routing/ScreenPage'

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
        message="URL에 초대 토큰이 없습니다. 매니저에게 받은 초대 링크로 다시 접속해 주세요."
        title="초대 토큰이 없습니다"
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
          <p className={`${eyebrowClass} text-[var(--color-primary-coral)]`}>조직 초대</p>
          <h1 className="mt-3.5 text-[32px] font-black leading-[1.14] tracking-[-0.045em] text-[var(--color-text-primary)] [text-wrap:balance]">
            조직에 합류하시겠어요?
          </h1>
          <p className={bodyClass}>
            매니저가 회원님을 조직에 초대했습니다. 합류하면 이 조직의 매니저가 회원님의 팬미팅
            일정과 운영을 함께 관리합니다.
          </p>

          <dl className="mt-[30px] grid border-t border-[var(--color-divider)] pt-[9px]">
            <div className="flex items-baseline justify-between gap-5 border-b border-[var(--color-border-row)] py-[13px]">
              <dt className="text-[15px] font-semibold text-[var(--color-text-tertiary)]">
                내 역할
              </dt>
              <dd className="m-0 text-base font-extrabold text-[var(--color-primary-coral)]">
                인플루언서
              </dd>
            </div>
          </dl>

          {error ? (
            <div className="mt-5">
              <AlertBanner title="초대를 수락하지 못했습니다" variant="error">
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
              나중에
            </button>
          </div>
          <p className="mt-[13px] text-sm font-medium leading-[1.6] text-[var(--color-text-tertiary)]">
            수락하면 초대 링크는 즉시 사용 완료되며, 한 번에 하나의 조직에만 소속될 수 있습니다.
          </p>
        </div>
      ) : null}

      {view === 'accepted' ? (
        <div className={cardClass} role="status">
          <p className={`${eyebrowClass} text-[var(--color-success)]`}>합류 완료</p>
          <h1 className="mt-3.5 text-[32px] font-black leading-[1.14] tracking-[-0.045em] text-[var(--color-text-primary)]">
            {organizationName}에 합류했어요
          </h1>
          <p className={bodyClass}>
            이제 조직 매니저가 팬미팅을 등록하면 나의 팬미팅에서 일정을 확인할 수 있습니다.
          </p>
          <Link
            className="mj-font-emphasis mt-7 inline-flex min-h-[54px] items-center rounded-[10px] bg-[var(--color-primary-coral)] px-6 text-base text-white transition-colors hover:bg-[var(--color-primary-coral-hover)]"
            to="/influencer/mypage/fan-meetings"
          >
            나의 팬미팅으로 가기
          </Link>
        </div>
      ) : null}

      {view === 'expired' ? (
        <div className={cardClass} role="alert">
          <p className={`${eyebrowClass} text-[var(--color-text-tertiary)]`}>초대 만료</p>
          <h1 className="mt-3.5 text-[30px] font-black leading-[1.16] tracking-[-0.045em] text-[var(--color-text-primary)]">
            초대 링크가 만료됐어요
          </h1>
          <p className={bodyClass}>
            초대 링크는 발급 후 일정 시간 동안만 사용할 수 있습니다. 매니저에게 새 초대를 요청해
            주세요.
          </p>
          <p className={footnoteClass}>이미 사용한 링크로도 이 화면이 표시됩니다.</p>
        </div>
      ) : null}

      {view === 'conflict' ? (
        <div className={cardClass} role="alert">
          <p className={`${eyebrowClass} text-[var(--color-warning)]`}>합류할 수 없음</p>
          <h1 className="mt-3.5 text-[30px] font-black leading-[1.16] tracking-[-0.045em] text-[var(--color-text-primary)]">
            이미 다른 조직에 소속되어 있어요
          </h1>
          <p className={bodyClass}>
            한 번에 하나의 조직에만 소속될 수 있습니다. 현재{' '}
            {currentOrganizationName ? (
              <>
                <strong className="font-extrabold text-[var(--color-text-primary)]">
                  {currentOrganizationName}
                </strong>
                에
              </>
            ) : (
              '다른 조직에'
            )}{' '}
            소속되어 있어 이 초대를 수락할 수 없습니다.
          </p>
          <p className={footnoteClass}>기존 조직에서 소속 해제된 뒤 다시 초대를 받아 주세요.</p>
        </div>
      ) : null}
    </div>
  )
}
