import { CheckCircle, EnvelopeSimple } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import { confirmEmailVerification, maskEmail } from '../../api/emailVerifications'
import {
  AlertBanner,
  Button,
  Card,
  CardContent,
  EmailVerificationNotice,
  Spinner,
} from '../../components'
import { useTranslation } from '../../i18n'

type ConfirmPhase =
  | { kind: 'checking' }
  | { kind: 'verified'; email?: string; alreadyVerified: boolean }
  | { kind: 'invalid' }
  | { kind: 'rateLimited' }
  | { kind: 'failed'; message: string }

/** 열린 리다이렉트를 막기 위해 내부 절대 경로만 복귀 주소로 인정한다. */
function safeInternalPath(value: string | null): string | undefined {
  return value?.startsWith('/') && !value.startsWith('//') ? value : undefined
}

/**
 * 인증 메일 링크(/email-verification?token=...)가 도착하는 화면이다.
 *
 * 백엔드 confirm API는 로그인한 본인만 호출할 수 있으므로, 세션이 없으면 토큰을 포함한
 * 현재 주소로 되돌아오도록 로그인 화면을 먼저 거친다. 이때 토큰이 로그인 화면의
 * redirect 파라미터에 잠시 실리는 것은 이 구조에서 피할 수 없고, 토큰은 일회성이며
 * 확인이 끝나는 즉시 아래에서 주소창을 정리한다.
 *
 * 토큰은 확인 결과가 확정된 뒤에만 URL에서 지운다. 요청 전에 지우면 세션 만료로
 * 로그인을 다녀오거나 확인 중 새로고침을 한 사용자의 유효한 링크가 유실된다.
 */
export function EmailVerifiedPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [returnTo] = useState(() => safeInternalPath(searchParams.get('returnUrl')))
  const [phase, setPhase] = useState<ConfirmPhase>({ kind: 'checking' })
  // URL에서 지운 뒤에도 재시도(429·일시 오류)에 쓸 수 있도록 상태로 보관한다. 로그로는 남기지 않는다.
  const [token, setToken] = useState<string>()
  // 같은 토큰을 중복 확인하지 않기 위한 마지막 처리 토큰이다.
  const processedTokenRef = useRef<string | undefined>(undefined)
  const session = getAuthSession()

  /** 확인 결과가 확정된 토큰을 주소창에서 제거한다. 복귀 주소 파라미터는 유지한다. */
  function stripTokenFromUrl() {
    const cleaned = new URLSearchParams(window.location.search)
    if (!cleaned.has('token')) return
    cleaned.delete('token')
    navigate(
      { pathname: location.pathname, search: cleaned.size ? `?${cleaned.toString()}` : '' },
      { replace: true },
    )
  }

  // URL에 새 토큰이 나타날 때마다 확인한다. 개발용 링크로 같은 라우트에 다시 들어오는
  // 경우(쿼리만 변경)에도 동작해야 하므로 첫 마운트 1회로 제한하지 않는다.
  useEffect(() => {
    const fresh = searchParams.get('token')?.trim()
    if (!fresh || fresh === processedTokenRef.current) return

    processedTokenRef.current = fresh
    setToken(fresh)
    // 인증 링크는 토큰 자체가 소유 증명이므로 로그인하지 않은 브라우저에서도 확인한다.
    void runConfirm(fresh, session?.accessToken)
    // session 객체는 렌더마다 새로 만들어지므로 토큰 파라미터 변화에만 반응한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  async function runConfirm(rawToken: string, accessToken?: string) {
    setPhase({ kind: 'checking' })
    try {
      const status = await confirmEmailVerification(rawToken, accessToken)
      stripTokenFromUrl()
      setPhase({ kind: 'verified', email: status.email, alreadyVerified: false })
    } catch (reason) {
      if (reason instanceof ApiError) {
        if (reason.code === 'EMAIL_ALREADY_VERIFIED') {
          stripTokenFromUrl()
          setPhase({ kind: 'verified', alreadyVerified: true })
          return
        }
        if (reason.code === 'EMAIL_VERIFICATION_TOKEN_INVALID') {
          // 토큰이 서버에서 무효로 확정된 경우에만 URL에서 지운다.
          stripTokenFromUrl()
          setPhase({ kind: 'invalid' })
          return
        }
        if (reason.status === 429) {
          setPhase({ kind: 'rateLimited' })
          return
        }
        if (reason.status === 401) {
          // 재발급까지 실패하면 client.ts가 세션을 지우고 App이 로그인으로 보낸다.
          // 토큰은 URL에 남아 있으므로 재로그인 후 자동으로 다시 확인된다.
          setPhase({ kind: 'failed', message: t('emailVerifiedPage.t21') })
          return
        }
        setPhase({ kind: 'failed', message: reason.message })
        return
      }
      setPhase({ kind: 'failed', message: t('emailVerifiedPage.t22') })
    }
  }

  /** 429·일시 오류 후 재시도한다. 보관해 둔 토큰을 그대로 다시 확인한다. */
  function retryConfirm() {
    const accessToken = getAuthSession()?.accessToken
    if (token) void runConfirm(token, accessToken)
  }

  // 인증 완료는 본인 확인이 필요하므로 로그인 후 이 주소(토큰 포함)로 되돌아온다.
  const hasToken = Boolean(token ?? searchParams.get('token')?.trim())

  // 토큰 없이 직접 접근한 경우에만 로그인 화면으로 보낸다.
  if (!session && !hasToken) {
    const redirect = encodeURIComponent(`${location.pathname}${location.search}`)
    return <Navigate replace to={`/login?redirect=${redirect}`} />
  }

  // 메일 링크를 다른 브라우저에서 연 비로그인 사용자도 인증 결과를 확인할 수 있어야 한다.
  // 이 분기는 아래의 로그인 사용자용 완료 화면과 달리 인증 후 로그인 화면으로 이동시킨다.
  if (!session) {
    return (
      <div className="mx-auto grid w-full max-w-xl gap-6 py-12">
        <Card>
          <CardContent className="grid gap-6 p-8">
            {phase.kind === 'checking' ? (
              <div className="flex min-h-40 items-center justify-center">
                <Spinner label={t('emailVerifiedPage.t1')} size="lg" />
              </div>
            ) : phase.kind === 'verified' ? (
              <AlertBanner title={t('emailVerifiedPage.t2')} variant="success">
                {t('emailVerifiedPage.t3')}
              </AlertBanner>
            ) : (
              <AlertBanner title={t('emailVerifiedPage.t4')} variant="error">
                {phase.kind === 'failed'
                  ? phase.message
                  : phase.kind === 'rateLimited'
                    ? t('emailVerifiedPage.t23')
                    : t('emailVerifiedPage.t24')}
              </AlertBanner>
            )}
            {phase.kind === 'verified' ? (
              <Button className="w-full" onClick={() => navigate('/login')} size="lg">
                {t('emailVerifiedPage.t5')}
              </Button>
            ) : phase.kind === 'rateLimited' || phase.kind === 'failed' ? (
              <Button className="w-full" onClick={retryConfirm} variant="secondary">
                {t('emailVerifiedPage.t6')}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    )
  }

  const fallbackPath = session?.role === 'FAN' ? '/fan/events' : session ? '/' : '/login'
  const donePath = returnTo ?? fallbackPath
  const doneLabel = returnTo ? t('emailVerifiedPage.t25') : session.role === 'FAN' ? t('emailVerifiedPage.t26') : t('emailVerifiedPage.t27')

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6 py-12">
      <Card>
        <CardContent className="grid gap-6 p-8">
          {/* 성공 상태를 최우선으로 그려야 토큰 없이 진입해 안내 카드로 인증을 마친 경우에도 완료 화면이 보인다. */}
          {phase.kind === 'verified' ? (
            <>
              <div className="grid justify-items-center gap-4 text-center">
                <CheckCircle
                  aria-hidden
                  className="text-[var(--color-success)]"
                  size={56}
                  weight="duotone"
                />
                <div>
                  <h1 className="text-2xl font-black tracking-[-0.03em]">
                    {phase.alreadyVerified ? t('emailVerifiedPage.t28') : t('emailVerifiedPage.t29')}
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
                    {phase.email ? t('emailVerifiedPage.t30', { p0: maskEmail(phase.email) }) : ''}
                    {t('emailVerifiedPage.t7')}
                  </p>
                </div>
              </div>
              <Button className="w-full" size="lg" onClick={() => navigate(donePath)}>
                {doneLabel}
              </Button>
            </>
          ) : !hasToken ? (
            <>
              <StateHeading
                description={t('emailVerifiedPage.t8')}
                title={t('emailVerifiedPage.t9')}
              />
              <EmailVerificationNotice onVerified={() => setPhase({ kind: 'verified', alreadyVerified: true })} />
            </>
          ) : phase.kind === 'checking' ? (
            <div className="flex min-h-40 items-center justify-center">
              <Spinner label={t('emailVerifiedPage.t10')} size="lg" />
            </div>
          ) : phase.kind === 'invalid' ? (
            <>
              <StateHeading
                description={t('emailVerifiedPage.t11')}
                title={t('emailVerifiedPage.t12')}
              />
              <EmailVerificationNotice onVerified={() => setPhase({ kind: 'verified', alreadyVerified: true })} />
            </>
          ) : phase.kind === 'rateLimited' ? (
            <>
              <StateHeading
                description={t('emailVerifiedPage.t13')}
                title={t('emailVerifiedPage.t14')}
              />
              <Button className="w-full" onClick={retryConfirm} variant="secondary">
                {t('emailVerifiedPage.t15')}
              </Button>
            </>
          ) : (
            <>
              <AlertBanner title={t('emailVerifiedPage.t16')} variant="error">
                {phase.message}
              </AlertBanner>
              <Button className="w-full" onClick={retryConfirm} variant="secondary">
                {t('emailVerifiedPage.t17')}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-sm text-[var(--color-text-secondary)]">
        {t('emailVerifiedPage.t18')}{' '}
        <Link className="font-bold underline underline-offset-4" to="/service-notices">
          {t('emailVerifiedPage.t19')}
        </Link>
        {t('emailVerifiedPage.t20')}
      </p>
    </div>
  )
}

/** 실패 계열 상태의 아이콘·제목·설명 묶음이다. */
function StateHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid justify-items-center gap-4 text-center">
      <EnvelopeSimple
        aria-hidden
        className="text-[var(--color-text-tertiary)]"
        size={56}
        weight="duotone"
      />
      <div>
        <h1 className="text-2xl font-black tracking-[-0.03em]">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">{description}</p>
      </div>
    </div>
  )
}
