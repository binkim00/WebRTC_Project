import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { saveAuthSession } from '../../api/auth'
import {
  socialLink,
  toProviderPath,
  SOCIAL_PROVIDER_LABELS,
  type SocialLoginResult,
} from '../../api/socialAuth'
import { AlertBanner, Button, Card, CardContent, TextField } from '../../components'
import { useTranslation } from '../../i18n'
import { landingPathForRole } from '../../router/roleCapabilities'

/**
 * 기존 계정에 소셜 계정을 연결하는 확인 화면이다. (`/login/social-link`)
 *
 * 콜백 화면이 `LINK_REQUIRED`를 받았을 때 라우터 state로 결과를 넘겨 준다. 같은 이메일로 이미
 * 가입한 계정이 있으므로, 그 계정의 비밀번호로 본인임을 확인한 뒤 연결과 로그인을 한 번에 끝낸다.
 *
 * 이 분기에서 `emailProvided`는 의미가 없고 `maskedEmail`만 쓴다. 어느 계정에 연결되는지
 * 사용자가 확인할 수 있어야 하기 때문이다.
 */
export function SocialLinkPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [result] = useState<SocialLoginResult | undefined>(() => {
    const state = location.state as SocialLoginResult | null
    return state?.status === 'LINK_REQUIRED' && state.socialToken ? state : undefined
  })

  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [passwordError, setPasswordError] = useState<string>()
  const [submitError, setSubmitError] = useState<string>()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!result?.socialToken || !password || submitting) return

    setSubmitting(true)
    setPasswordError(undefined)
    setSubmitError(undefined)
    try {
      const login = await socialLink({ socialToken: result.socialToken, password })
      saveAuthSession(login, false)

      // 첫 화면 규칙은 landingPathForRole 한곳에서만 정한다. 여기에 역할 분기를 복사해 두면
      // (실제로 그랬다) 규칙을 바꿀 때 이 흐름만 빠져 로그인 후 엉뚱한 화면으로 간다.
      navigate(landingPathForRole(login.role), { replace: true })
    } catch (reason) {
      if (reason instanceof ApiError) {
        // 비밀번호만 틀린 경우는 화면을 유지하고 입력창 아래에 알려 다시 시도하게 한다.
        if (reason.code === 'SOCIAL_LINK_PASSWORD_MISMATCH') {
          setPasswordError(reason.message)
          return
        }
        // 임시 토큰이 5분을 넘긴 경우다. 이 화면에서는 복구할 수 없다.
        if (reason.code === 'SOCIAL_TOKEN_INVALID') {
          setSubmitError(
            t('socialLinkPage.t1'),
          )
          return
        }
        // 반복 실패로 차단된 경우다. 옛 예외 처리기가 영문 메시지를 주므로 문구를 직접 넣는다.
        if (reason.status === 429) {
          setSubmitError(
            t('socialLinkPage.t2'),
          )
          return
        }
        if (reason.status === 403) {
          setSubmitError(t('socialLinkPage.t3'))
          return
        }
        setSubmitError(reason.message)
        return
      }
      setSubmitError(t('socialLinkPage.t4'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!result) return <Navigate replace to="/login" />

  const providerLabel = SOCIAL_PROVIDER_LABELS()[toProviderPath(result.provider)]

  return (
    <main className="mx-auto grid w-full max-w-xl gap-6 py-12">
      <div>
        <p className="text-[13px] font-extrabold tracking-[0.08em] text-[var(--color-primary-coral)]">
          {providerLabel}  {t('socialLinkPage.t9')} </p>
        <h1 className="mt-3.5 text-[32px] font-black tracking-[-0.045em] [text-wrap:balance]">
           {t('socialLinkPage.t10')} </h1>
        <p className="mt-3 text-[17px] font-medium leading-[1.7] text-[var(--color-text-body)]">
          {result.message ??
            t('socialLinkPage.t11', { p0: result.maskedEmail ?? t('socialLinkPage.t5'), p1: providerLabel })}
        </p>
      </div>

      <Card>
        <CardContent className="p-7">
          <form className="grid gap-[18px]" onSubmit={(event) => void handleSubmit(event)}>
            {/* 어느 계정에 연결되는지 확인할 수 있어야 한다. 서버가 마스킹한 값을 그대로 쓴다. */}
            {result.maskedEmail ? (
              <div>
                <p className="text-sm font-bold text-[var(--color-text-primary)]">{t('socialLinkPage.t12')}</p>
                <p className="mt-2 text-base font-extrabold">{result.maskedEmail}</p>
              </div>
            ) : null}

            <TextField
              autoComplete="current-password"
              error={passwordError}
              label={t('socialLinkPage.t6')}
              onChange={(event) => setPassword(event.currentTarget.value)}
              placeholder={t('socialLinkPage.t7')}
              type="password"
              value={password}
            />

            {submitError ? (
              <AlertBanner title={t('socialLinkPage.t8')} variant="error">
                {submitError}
              </AlertBanner>
            ) : null}

            <Button disabled={!password || submitting} loading={submitting} size="lg" type="submit">
               {t('socialLinkPage.t13')} </Button>
            <Button
              onClick={() => navigate('/login', { replace: true })}
              type="button"
              variant="secondary"
            >
               {t('socialLinkPage.t14')} </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
