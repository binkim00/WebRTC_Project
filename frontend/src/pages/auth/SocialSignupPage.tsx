import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import {
  PREFERRED_LANGUAGE_OPTIONS,
  isPreferredLanguage,
  saveAuthSession,
} from '../../api/auth'
import {
  socialSignup,
  toProviderPath,
  SOCIAL_PROVIDER_LABELS,
  type SocialLoginResult,
} from '../../api/socialAuth'
import { AlertBanner, Button, Card, CardContent, Select, TextField } from '../../components'
import { useTranslation } from '../../i18n'
import { landingPathForRole } from '../../router/roleCapabilities'


/**
 * 소셜 신규 가입 추가정보 화면이다. (`/signup/social`)
 *
 * 콜백 화면이 `SIGNUP_REQUIRED`를 받았을 때 라우터 state로 결과를 넘겨 준다. 주소에 담지 않는
 * 이유는 `socialToken`이 5분 만료 자격증명이라 히스토리·공유 링크에 남지 않아야 하기 때문이다.
 *
 * 역할과 비밀번호는 받지 않는다. 서버가 역할을 FAN으로 고정하고 소셜 계정은 비밀번호가 없다.
 */
export function SocialSignupPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  // 콜백에서 넘겨받은 값이며 새로고침하면 사라진다. 그때는 처음부터 다시 시작해야 한다.
  const [result] = useState<SocialLoginResult | undefined>(() => {
    const state = location.state as SocialLoginResult | null
    return state?.status === 'SIGNUP_REQUIRED' && state.socialToken ? state : undefined
  })

  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [language, setLanguage] = useState('')
  const [termsAgreed, setTermsAgreed] = useState(false)
  const [privacyAgreed, setPrivacyAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string>()

  // 공급자가 이메일을 주지 않은 경우에만 입력칸을 띄운다. (emailProvided는 이 분기에서만 의미가 있다)
  const needsEmail = result ? !result.emailProvided : false

  const nicknameError = nickname.trim() ? '' : t('socialSignupPage.t1')
  const emailError = !needsEmail
    ? ''
    : !email.trim()
      ? t('socialSignupPage.t2')
      : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ? ''
        : t('socialSignupPage.t3')
  const languageError = isPreferredLanguage(language) ? '' : t('socialSignupPage.t4')
  const termsError = termsAgreed && privacyAgreed ? '' : t('socialSignupPage.t5')
  const canSubmit =
    !nicknameError && !emailError && !languageError && !termsError && !submitting

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!result?.socialToken || !canSubmit || !isPreferredLanguage(language)) return

    setSubmitting(true)
    setSubmitError(undefined)
    try {
      const login = await socialSignup({
        socialToken: result.socialToken,
        nickname: nickname.trim(),
        // 공급자가 이메일을 준 경우에는 필드를 아예 보내지 않는다.
        ...(needsEmail ? { email: email.trim() } : {}),
        preferredLanguage: language,
        termsOfServiceAgreed: termsAgreed,
        privacyPolicyAgreed: privacyAgreed,
      })

      saveAuthSession(login, false)
      // 일반 로그인·소셜 로그인과 같은 규칙으로 첫 화면을 정한다. 예전에는 팬 마이페이지로
      // 곧장 보냈는데, 역할 경로가 한곳에 모이지 않아 "로그인 후 메인" 규칙이 새어 나갔다.
      navigate(landingPathForRole(login.role), { replace: true })
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === 'SOCIAL_TOKEN_INVALID') {
        // 5분이 지나 임시 토큰이 만료된 경우다. 같은 화면에서 재시도할 방법이 없다.
        setSubmitError(
          t('socialSignupPage.t6'),
        )
        return
      }
      setSubmitError(
        reason instanceof ApiError
          ? reason.message
          : t('socialSignupPage.t7'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  // state 없이 직접 들어오거나 새로고침한 경우다. 임시 토큰이 없어 진행할 수 없다.
  if (!result) return <Navigate replace to="/login" />

  const providerLabel = SOCIAL_PROVIDER_LABELS()[toProviderPath(result.provider)]

  return (
    <main className="mx-auto grid w-full max-w-xl gap-6 py-12">
      <div>
        <p className="text-[13px] font-extrabold tracking-[0.08em] text-[var(--color-primary-coral)]">
          {providerLabel}  {t('socialSignupPage.t15')} </p>
        <h1 className="mt-3.5 text-[32px] font-black tracking-[-0.045em] [text-wrap:balance]">
           {t('socialSignupPage.t16')} </h1>
        {/* 서버가 상황에 맞는 안내 문구를 내려 준다. 이메일 미제공 안내도 여기에 담겨 온다. */}
        <p className="mt-3 text-[17px] font-medium leading-[1.7] text-[var(--color-text-body)]">
          {result.message ?? t('socialSignupPage.t8')}
        </p>
      </div>

      <Card>
        <CardContent className="p-7">
          <form className="grid gap-[18px]" onSubmit={(event) => void handleSubmit(event)}>
            <TextField
              label={t('socialSignupPage.t9')}
              onChange={(event) => setNickname(event.currentTarget.value)}
              placeholder={t('socialSignupPage.t10')}
              value={nickname}
            />

            {needsEmail ? (
              <TextField
                label={t('socialSignupPage.t11')}
                onChange={(event) => setEmail(event.currentTarget.value)}
                placeholder="example@email.com"
                type="email"
                value={email}
              />
            ) : (
              // 공급자에게 받은 이메일은 수정할 수 없으므로 확인용으로만 보여 준다.
              <div>
                <p className="text-sm font-bold text-[var(--color-text-primary)]">{t('socialSignupPage.t17')}</p>
                <p className="mt-2 text-base font-semibold text-[var(--color-text-secondary)]">
                  {result.email ?? '-'}
                </p>
              </div>
            )}

            <Select
              label={t('socialSignupPage.t12')}
              onChange={(event) => setLanguage(event.currentTarget.value)}
              options={[{ label: t('socialSignupPage.t13'), value: '' }, ...PREFERRED_LANGUAGE_OPTIONS]}
              value={language}
            />

            <div className="grid gap-3 border-t border-[var(--color-divider)] pt-5">
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
                <input
                  checked={termsAgreed}
                  className="m-0 size-5 flex-none cursor-pointer accent-[var(--color-primary-coral)]"
                  onChange={() => setTermsAgreed((agreed) => !agreed)}
                  type="checkbox"
                />
                <span className="text-[15px] font-semibold">
                   {t('socialSignupPage.t18')}{' '}
                  <span className="text-[var(--color-primary-coral)]">*</span>
                </span>
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
                <input
                  checked={privacyAgreed}
                  className="m-0 size-5 flex-none cursor-pointer accent-[var(--color-primary-coral)]"
                  onChange={() => setPrivacyAgreed((agreed) => !agreed)}
                  type="checkbox"
                />
                <span className="text-[15px] font-semibold">
                   {t('socialSignupPage.t19')}{' '}
                  <span className="text-[var(--color-primary-coral)]">*</span>
                </span>
              </label>
            </div>

            {submitError ? (
              <AlertBanner title={t('socialSignupPage.t14')} variant="error">
                {submitError}
              </AlertBanner>
            ) : null}

            <Button disabled={!canSubmit} loading={submitting} size="lg" type="submit">
               {t('socialSignupPage.t20')} </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
