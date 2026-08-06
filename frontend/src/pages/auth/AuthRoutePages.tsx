import { EyeIcon, EyeSlashIcon } from '@phosphor-icons/react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import {
  PREFERRED_LANGUAGE_OPTIONS,
  clearAuthSession,
  isPreferredLanguage,
  login,
  saveAuthSession,
  signup,
  type SignupRequest,
  type SignupRole,
} from '../../api/auth'
import { maskEmail } from '../../api/emailVerifications'
import { isEmailVerificationEnabled } from '../../config/features'
import { AlertBanner, EmailVerificationNotice, SocialLoginButtons } from '../../components'
import { useTranslation, type TranslationKey } from '../../i18n'
import { landingPathForRole } from '../../router/roleCapabilities'

/**
 * 역할 선택 옵션이다. 값은 백엔드 enum을 그대로 쓰고, 라벨·설명은 **사전 키**로 들고 있는다.
 *
 * 이 배열은 모듈 상수라 훅을 쓸 수 없고 언어가 바뀔 때 다시 만들 수도 없다. 그래서 번역은
 * 항목을 그리는 컴포넌트가 수행한다. (appHeaderNavigation과 같은 방식)
 */
const roleOptions: readonly {
  value: SignupRole
  labelKey: TranslationKey
  noteKey: TranslationKey
}[] = [
  { value: 'FAN', labelKey: 'signup.role.fan', noteKey: 'signup.role.fan.note' },
  {
    value: 'INFLUENCER',
    labelKey: 'signup.role.influencer',
    noteKey: 'signup.role.influencer.note',
  },
  {
    value: 'SOLO_INFLUENCER',
    labelKey: 'signup.role.soloInfluencer',
    noteKey: 'signup.role.soloInfluencer.note',
  },
  { value: 'MANAGER', labelKey: 'signup.role.manager', noteKey: 'signup.role.manager.note' },
]

const signupInputClass =
  'mt-2 min-h-[50px] w-full rounded-lg border bg-white px-[13px] text-base font-semibold text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)] focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]'

function fieldBorderClass(invalid: boolean) {
  return invalid ? 'border-[var(--color-error)]' : 'border-[var(--color-border-control)]'
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="block text-sm font-bold text-[var(--color-text-primary)]">
      {children} <span className="text-[var(--color-primary-coral)]">*</span>
    </span>
  )
}

function FieldError({ children }: { children: ReactNode }) {
  return (
    <p className="mt-[7px] text-sm font-bold text-[var(--color-error)]" role="alert">
      {children}
    </p>
  )
}

export function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [submitError, setSubmitError] = useState<string>()
  // 회원가입 화면이 넘겨준 안내(이메일 인증 필요 등)를 초기값으로 표시한다.
  const [notice, setNotice] = useState<string | undefined>(() => {
    const state = location.state as { notice?: string } | null
    return typeof state?.notice === 'string' ? state.notice : undefined
  })

  const filled = loginId.trim() !== '' && password.trim() !== ''
  const canSubmit = filled && !loading

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return

    setSubmitError(undefined)
    setNotice(undefined)
    setLoading(true)

    try {
      const response = await login({
        loginId: loginId.trim(),
        password,
      })

      // HttpOnly 쿠키 기반 장기 세션 API가 없으므로 토큰은 현재 탭 세션에만 보관한다.
      saveAuthSession(response, false)
      const requestedPath = searchParams.get('redirect')
      const safeRequestedPath =
        requestedPath?.startsWith('/') && !requestedPath.startsWith('//')
          ? requestedPath
          : undefined
      const landingPath = safeRequestedPath ?? landingPathForRole(response.role)
      navigate(landingPath, { replace: true })
    } catch (error: unknown) {
      setSubmitError(
        error instanceof ApiError || error instanceof TypeError
          ? error.message
          : t('login.failed'),
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto grid w-full max-w-[1100px] items-center gap-9 py-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-[72px] lg:py-16">
      <section aria-labelledby="lg-intro" className="min-w-0">
        <p className="text-[13px] font-extrabold tracking-[0.08em] text-[var(--color-primary-coral)]">
          {t('login.eyebrow')}
        </p>
        <h1
          className="mt-4 text-[clamp(2rem,3.6vw,2.75rem)] font-black leading-[1.16] tracking-[-0.05em] text-[var(--color-text-primary)] [text-wrap:balance]"
          id="lg-intro"
        >
          {t('login.heading')}
        </h1>
        <p className="mt-4 max-w-[38ch] text-lg font-medium leading-[1.7] text-[var(--color-text-body)]">
          {t('login.lead')}
        </p>
      </section>

      <section
        aria-labelledby="lg-form"
        className="min-w-0 rounded-xl border border-[var(--color-divider)] p-7"
      >
        <h2 className="text-[22px] font-extrabold tracking-[-0.032em]" id="lg-form">
          {t('login.formTitle')}
        </h2>
        <p className="mt-[7px] text-[15px] font-medium text-[var(--color-text-tertiary)]">
          {t('login.formLead')}
        </p>

        {notice ? (
          <AlertBanner
            className="mt-5"
            onDismiss={() => setNotice(undefined)}
            title={t('login.noticeTitle')}
            variant="info"
          >
            {notice}
          </AlertBanner>
        ) : null}

        <form className="mt-6" onSubmit={(event) => void handleSubmit(event)}>
          <label className="block">
            <span className="block text-sm font-bold text-[var(--color-text-primary)]">
              {t('login.loginId')}
            </span>
            <input
              autoComplete="username"
              className="mt-2 min-h-[50px] w-full rounded-lg border border-[var(--color-border-control)] bg-white px-[13px] text-base font-semibold text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)] focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]"
              name="loginId"
              onChange={(event) => setLoginId(event.currentTarget.value)}
              placeholder={t('login.loginIdPlaceholder')}
              value={loginId}
            />
          </label>

          <label className="mt-[18px] block">
            <span className="block text-sm font-bold text-[var(--color-text-primary)]">
              {t('login.password')}
            </span>
            <span className="relative mt-2 block">
              <input
                autoComplete="current-password"
                className="min-h-[50px] w-full rounded-lg border border-[var(--color-border-control)] bg-white pl-[13px] pr-[52px] text-base font-semibold text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)] focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]"
                name="password"
                onChange={(event) => setPassword(event.currentTarget.value)}
                placeholder={t('login.passwordPlaceholder')}
                type={showPassword ? 'text' : 'password'}
                value={password}
              />
              <button
                aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                aria-pressed={showPassword}
                className="absolute right-1.5 top-1/2 grid min-h-11 min-w-11 -translate-y-1/2 place-items-center text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
                onClick={() => setShowPassword((visible) => !visible)}
                type="button"
              >
                {showPassword ? (
                  <EyeSlashIcon aria-hidden="true" size={20} />
                ) : (
                  <EyeIcon aria-hidden="true" size={20} />
                )}
              </button>
            </span>
          </label>

          <div className="mt-[18px] flex items-center justify-end gap-4">
            <button
              aria-disabled="true"
              className="cursor-not-allowed whitespace-nowrap text-[15px] font-bold text-[var(--color-text-tertiary)]"
              disabled
              title={t('login.forgotPasswordTitle')}
              type="button"
            >
              {t('login.forgotPasswordPending')}
            </button>
          </div>

          {submitError ? (
            <p
              className="mt-[18px] rounded-lg bg-[var(--color-error-soft)] px-3.5 py-3 text-[15px] font-semibold leading-[1.55] text-[var(--color-error)]"
              role="alert"
            >
              {submitError}
            </p>
          ) : null}

          <button
            className={`mj-font-emphasis mt-5 min-h-[54px] w-full rounded-[10px] border text-[17px] transition-colors ${
              canSubmit
                ? 'border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] text-white hover:bg-[var(--color-primary-coral-hover)]'
                : 'cursor-not-allowed border-[var(--color-border-control)] bg-[var(--color-surface-subtle)] text-[var(--color-text-tertiary)]'
            }`}
            disabled={!canSubmit}
            title={filled ? undefined : t('login.fillBoth')}
            type="submit"
          >
            {loading ? t('login.submitting') : t('login.submit')}
          </button>
        </form>

        {/*
          소셜 로그인. 아이디·비밀번호 입력과 구분되도록 구분선과 안내를 두고 아래에 배치한다.
          가입 여부에 따라 서버가 흐름을 정하므로(LOGIN·SIGNUP_REQUIRED·LINK_REQUIRED)
          버튼 문구는 "시작하기"로 두어 로그인과 가입을 함께 안내한다.
        */}
        <div className="mt-6 border-t border-[var(--color-divider)] pt-6">
          <p className="mb-3 text-center text-[13px] font-bold text-[var(--color-text-tertiary)]">
            {t('login.socialDivider')}
          </p>
          <SocialLoginButtons />
        </div>

        <p className="mt-5 border-t border-[var(--color-divider)] pt-[18px] text-[15px] font-medium text-[var(--color-text-tertiary)]">
          {t('login.noAccount')}{' '}
          <Link className="font-extrabold text-[var(--color-primary-coral)]" to="/signup">
            {t('login.goSignup')}
          </Link>
        </p>
      </section>
    </main>
  )
}

/**
 * 회원가입 화면의 진행 단계다.
 *
 * `form`은 입력·가입 요청, `verifying`은 가입 직후 이메일 인증 단계다.
 * 인증까지 끝나면 로그인 화면으로 넘긴다.
 */
type SignupPhase =
  | { kind: 'form' }
  | { kind: 'verifying'; email: string; role: SignupRole }

export function SignupPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [loginId, setLoginId] = useState('')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [language, setLanguage] = useState('')
  const [role, setRole] = useState<SignupRole>()
  const [termsAgreed, setTermsAgreed] = useState(false)
  const [privacyAgreed, setPrivacyAgreed] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [showPassword, setShowPassword] = useState(false)
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false)
  const [policyNotice, setPolicyNotice] = useState<string>()
  const [submitError, setSubmitError] = useState<string>()
  const [loading, setLoading] = useState(false)
  // 가입 완료 후 이메일 인증 단계로 넘어가기 위한 진행 상태다.
  const [phase, setPhase] = useState<SignupPhase>({ kind: 'form' })

  const markTouched = (field: string) => () =>
    setTouched((current) => ({ ...current, [field]: true }))

  // dc.html의 blur 검증 흐름 그대로, 각 필드의 오류 문구를 계산한다.
  const emailError = !email.trim()
    ? t('signup.error.email')
    : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ? t('signup.error.emailFormat')
      : ''
  const loginIdError = loginId.trim() ? '' : t('signup.error.loginId')
  const nicknameError = nickname.trim() ? '' : t('signup.error.nickname')
  const passwordError = !password
    ? t('signup.error.password')
    : !/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)
      ? t('signup.error.passwordRule')
      : ''
  const passwordConfirmError = !passwordConfirm
    ? t('signup.error.passwordConfirm')
    : passwordConfirm === password
      ? ''
      : t('signup.error.passwordMismatch')
  const languageError = isPreferredLanguage(language) ? '' : t('signup.error.language')
  const roleError = role ? '' : t('signup.error.role')
  const termsError = termsAgreed && privacyAgreed ? '' : t('signup.error.terms')

  const allValid =
    !emailError &&
    !loginIdError &&
    !nicknameError &&
    !passwordError &&
    !passwordConfirmError &&
    !languageError &&
    !roleError &&
    !termsError
  const canSubmit = allValid && !loading

  const show = (field: string, error: string) => Boolean(error && touched[field])
  const selectedRole = roleOptions.find((option) => option.value === role)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!allValid || !role || !isPreferredLanguage(language)) {
      setTouched({
        email: true,
        loginId: true,
        nickname: true,
        password: true,
        passwordConfirm: true,
        language: true,
        role: true,
        terms: true,
      })
      return
    }
    if (loading) return

    setSubmitError(undefined)
    setLoading(true)

    const request: SignupRequest = {
      loginId: loginId.trim(),
      password,
      email: email.trim(),
      nickname: nickname.trim(),
      role,
      preferredLanguage: language,
      termsOfServiceAgreed: termsAgreed,
      privacyPolicyAgreed: privacyAgreed,
    }

    try {
      await signup(request)

      // 이메일 인증 기능이 꺼진 환경에서는 종전처럼 로그인 화면으로 바로 넘긴다.
      if (!isEmailVerificationEnabled) {
        navigate('/login', {
          replace: true,
          state: { notice: t('authRoutePages.t1') },
        })
        return
      }

      // 인증 메일 발송·상태 조회 API는 모두 로그인 토큰을 요구하는데 회원가입 응답에는
      // 토큰이 없다(userId·role·createdAt만 내려온다). 그래서 방금 입력한 자격증명으로
      // 곧바로 로그인해 임시 세션을 만들고, 그 세션으로 인증 단계를 진행한다.
      // 이 임시 세션은 인증 단계를 벗어날 때(완료·나중에 하기) leaveVerifyingPhase가 반드시 지운다.
      try {
        const session = await login({ loginId: request.loginId, password: request.password })
        saveAuthSession(session, false)
        setPhase({ kind: 'verifying', email: request.email, role: request.role })
      } catch {
        // 가입은 성공했으나 자동 로그인이 막힌 경우다(계정 상태·정책 등).
        // 인증 단계를 띄울 수 없으므로 로그인 후 마이페이지에서 인증하도록 안내만 남긴다.
        navigate('/login', {
          replace: true,
          state: {
            notice: t('authRoutePages.t8', { p0: maskEmail(request.email) }),
          },
        })
      }
    } catch (error: unknown) {
      setSubmitError(
        error instanceof ApiError || error instanceof TypeError
          ? error.message
          : t('signup.failed'),
      )
    } finally {
      setLoading(false)
    }
  }

  /**
   * 인증 단계를 마치고 로그인 화면으로 넘긴다.
   *
   * 인증 메일 발송을 위해 만든 임시 세션을 여기서 반드시 지운다. 그대로 두면 사용자가
   * 로그인하지 않았는데도 로그인 상태로 서비스에 들어가게 된다.
   */
  function leaveVerifyingPhase(notice: string) {
    clearAuthSession()
    navigate('/login', { replace: true, state: { notice } })
  }

  function passwordToggle(shown: boolean, onToggle: () => void, targetLabel: string) {
    return (
      <button
        aria-label={shown ? t('authRoutePages.t9', { p0: targetLabel }) : t('authRoutePages.t10', { p0: targetLabel })}
        aria-pressed={shown}
        className="absolute right-1.5 top-1/2 grid min-h-11 min-w-11 -translate-y-1/2 place-items-center text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
        onClick={onToggle}
        type="button"
      >
        {shown ? (
          <EyeSlashIcon aria-hidden="true" size={20} />
        ) : (
          <EyeIcon aria-hidden="true" size={20} />
        )}
      </button>
    )
  }

  // 가입 직후 이메일 인증 단계다. 인증 메일은 EmailVerificationNotice가 자동으로 한 번 보내고,
  // 재발송·완료 확인도 같은 카드에서 처리한다. 인증이 확인되면 로그인 화면으로 넘긴다.
  if (phase.kind === 'verifying') {
    return (
      <main className="mx-auto w-full max-w-[620px] pb-16 pt-8 sm:pt-12">
        <p className="text-[13px] font-extrabold tracking-[0.08em] text-[var(--color-primary-coral)]">
          MELLY FAN MEETING
        </p>
        <h1 className="mt-3.5 text-[32px] font-black tracking-[-0.045em] text-[var(--color-text-primary)] [text-wrap:balance]">
          {t('signup.verify.heading')}
        </h1>
        <p className="mt-3 text-[17px] font-medium leading-[1.7] text-[var(--color-text-body)]">
          {t('signup.verify.lead')}
        </p>

        <section className="mt-8 rounded-xl border border-[var(--color-divider)] p-7">
          <EmailVerificationNotice
            autoSend
            email={phase.email}
            onVerified={() =>
              leaveVerifyingPhase(t('signup.verify.done'))
            }
          />
        </section>

        {/*
          인증을 나중으로 미루는 경로다. 팬은 응모 시점에 인증이 필요하므로 그 사실을 함께 알린다.
          팬이 아닌 역할은 현재 인증을 요구하는 화면이 없어 안내 문구를 다르게 둔다.
        */}
        <button
          className="mt-5 min-h-11 w-full text-[15px] font-bold text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
          onClick={() =>
            leaveVerifyingPhase(
              phase.role === 'FAN'
                ? t('authRoutePages.t2')
                : t('authRoutePages.t3'),
            )
          }
          type="button"
        >
          {t('signup.verify.later')}
        </button>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-[620px] pb-16 pt-8 sm:pt-12">
      <p className="text-[13px] font-extrabold tracking-[0.08em] text-[var(--color-primary-coral)]">
        MELLY FAN MEETING
      </p>
      <h1 className="mt-3.5 text-[32px] font-black tracking-[-0.045em] text-[var(--color-text-primary)] [text-wrap:balance]">
        {t('signup.heading')}
      </h1>
      <p className="mt-3 text-[17px] font-medium leading-[1.7] text-[var(--color-text-body)]">
        {t('signup.lead')}
      </p>

      <section
        aria-labelledby="su-form"
        className="mt-8 border-t border-[var(--color-divider)] pt-7"
      >
        <h2 className="text-[22px] font-extrabold tracking-[-0.032em]" id="su-form">
          {t('signup.formTitle')}
        </h2>
        <p className="mt-[7px] text-[15px] font-medium text-[var(--color-text-tertiary)]">
          {t('signup.formLead')}
        </p>
      </section>

      <form className="mt-6" onSubmit={(event) => void handleSubmit(event)}>
        <p className="mb-5 text-sm font-semibold text-[var(--color-text-tertiary)]">
          <span className="text-[var(--color-primary-coral)]">*</span>{' '}
          {t('signup.requiredNote')}
        </p>

        <label className="block">
          <FieldLabel>{t('signup.email')}</FieldLabel>
          <input
            aria-invalid={show('email', emailError)}
            autoComplete="email"
            className={`${signupInputClass} ${fieldBorderClass(show('email', emailError))}`}
            onBlur={markTouched('email')}
            onChange={(event) => setEmail(event.currentTarget.value)}
            placeholder="example@email.com"
            type="email"
            value={email}
          />
        </label>
        {show('email', emailError) ? <FieldError>{emailError}</FieldError> : null}

        <div className="mt-[18px] grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block">
              <FieldLabel>{t('signup.loginId')}</FieldLabel>
              <input
                aria-invalid={show('loginId', loginIdError)}
                autoComplete="username"
                className={`${signupInputClass} ${fieldBorderClass(show('loginId', loginIdError))}`}
                onBlur={markTouched('loginId')}
                onChange={(event) => setLoginId(event.currentTarget.value)}
                placeholder={t('signup.loginIdPlaceholder')}
                value={loginId}
              />
            </label>
            {show('loginId', loginIdError) ? <FieldError>{loginIdError}</FieldError> : null}
          </div>
          <div>
            <label className="block">
              <FieldLabel>{t('signup.nickname')}</FieldLabel>
              <input
                aria-invalid={show('nickname', nicknameError)}
                autoComplete="nickname"
                className={`${signupInputClass} ${fieldBorderClass(show('nickname', nicknameError))}`}
                onBlur={markTouched('nickname')}
                onChange={(event) => setNickname(event.currentTarget.value)}
                placeholder={t('signup.nicknamePlaceholder')}
                value={nickname}
              />
            </label>
            {show('nickname', nicknameError) ? <FieldError>{nicknameError}</FieldError> : null}
          </div>
        </div>

        <label className="mt-[18px] block">
          <FieldLabel>{t('signup.password')}</FieldLabel>
          <span className="relative mt-2 block">
            <input
              aria-invalid={show('password', passwordError)}
              autoComplete="new-password"
              className={`${signupInputClass} mt-0 pr-[52px] ${fieldBorderClass(show('password', passwordError))}`}
              onBlur={markTouched('password')}
              onChange={(event) => setPassword(event.currentTarget.value)}
              placeholder={t('signup.passwordPlaceholder')}
              type={showPassword ? 'text' : 'password'}
              value={password}
            />
            {passwordToggle(showPassword, () => setShowPassword((visible) => !visible), t('authRoutePages.t4'))}
          </span>
        </label>
        {show('password', passwordError) ? (
          <FieldError>{passwordError}</FieldError>
        ) : (
          <p className="mt-[7px] text-sm font-medium text-[var(--color-text-tertiary)]">
            {t('signup.passwordHint')}
          </p>
        )}

        <label className="mt-[18px] block">
          <FieldLabel>{t('signup.passwordConfirm')}</FieldLabel>
          <span className="relative mt-2 block">
            <input
              aria-invalid={show('passwordConfirm', passwordConfirmError)}
              autoComplete="new-password"
              className={`${signupInputClass} mt-0 pr-[52px] ${fieldBorderClass(show('passwordConfirm', passwordConfirmError))}`}
              onBlur={markTouched('passwordConfirm')}
              onChange={(event) => setPasswordConfirm(event.currentTarget.value)}
              placeholder={t('signup.passwordConfirmPlaceholder')}
              type={showPasswordConfirm ? 'text' : 'password'}
              value={passwordConfirm}
            />
            {passwordToggle(
              showPasswordConfirm,
              () => setShowPasswordConfirm((visible) => !visible),
              t('authRoutePages.t5'),
            )}
          </span>
        </label>
        {show('passwordConfirm', passwordConfirmError) ? (
          <FieldError>{passwordConfirmError}</FieldError>
        ) : null}

        <label className="mt-[18px] block">
          <FieldLabel>{t('signup.language')}</FieldLabel>
          <select
            aria-invalid={show('language', languageError)}
            className={`mt-2 min-h-[50px] w-full rounded-lg border bg-white px-[11px] text-base font-semibold text-[var(--color-text-primary)] outline-none focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)] ${fieldBorderClass(show('language', languageError))}`}
            onBlur={markTouched('language')}
            onChange={(event) => setLanguage(event.currentTarget.value)}
            value={language}
          >
            <option value="">{t('signup.languagePlaceholder')}</option>
            {PREFERRED_LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {show('language', languageError) ? <FieldError>{languageError}</FieldError> : null}

        <fieldset className="mt-[22px] border-0 p-0">
          <legend className="p-0 text-sm font-bold text-[var(--color-text-primary)]">
            {t('signup.role')} <span className="text-[var(--color-primary-coral)]">*</span>
          </legend>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {roleOptions.map((option) => {
              const selected = role === option.value
              return (
                <button
                  aria-pressed={selected}
                  className={`min-h-12 whitespace-nowrap rounded-lg border px-[22px] text-base font-extrabold transition-colors ${
                    selected
                      ? 'border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] text-white'
                      : 'border-[var(--color-border-control)] bg-white text-[var(--color-text-primary)] hover:border-[var(--color-text-tertiary)]'
                  }`}
                  key={option.value}
                  onClick={() => {
                    setRole(option.value)
                    setTouched((current) => ({ ...current, role: true }))
                  }}
                  type="button"
                >
                  {t(option.labelKey)}
                </button>
              )
            })}
          </div>
        </fieldset>
        {selectedRole ? (
          <p
            aria-live="polite"
            className="mt-2.5 text-sm font-medium leading-[1.6] text-[var(--color-text-tertiary)]"
          >
            {t(selectedRole.noteKey)}
          </p>
        ) : null}
        {show('role', roleError) ? <FieldError>{roleError}</FieldError> : null}

        <div className="mt-6 grid gap-3 border-t border-[var(--color-divider)] pt-5">
          <div className="flex items-center justify-between gap-4">
            <label className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2.5">
              <input
                checked={termsAgreed}
                className="m-0 size-5 flex-none cursor-pointer accent-[var(--color-primary-coral)]"
                onChange={() => {
                  setTermsAgreed((agreed) => !agreed)
                  setTouched((current) => ({ ...current, terms: true }))
                }}
                type="checkbox"
              />
              <span className="text-[15px] font-semibold leading-[1.5] text-[var(--color-text-primary)]">
                {t('signup.agreeTerms')}{' '}
                <span className="text-[var(--color-primary-coral)]">*</span>
              </span>
            </label>
            <button
              className="whitespace-nowrap text-[15px] font-bold text-[var(--color-text-tertiary)] hover:text-[var(--color-primary-coral)]"
              onClick={() =>
                setPolicyNotice(
                  t('authRoutePages.t6'),
                )
              }
              type="button"
            >
               {t('authRoutePages.t11')} </button>
          </div>
          <div className="flex items-center justify-between gap-4">
            <label className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2.5">
              <input
                checked={privacyAgreed}
                className="m-0 size-5 flex-none cursor-pointer accent-[var(--color-primary-coral)]"
                onChange={() => {
                  setPrivacyAgreed((agreed) => !agreed)
                  setTouched((current) => ({ ...current, terms: true }))
                }}
                type="checkbox"
              />
              <span className="text-[15px] font-semibold leading-[1.5] text-[var(--color-text-primary)]">
                {t('signup.agreePrivacy')}{' '}
                <span className="text-[var(--color-primary-coral)]">*</span>
              </span>
            </label>
            <button
              className="whitespace-nowrap text-[15px] font-bold text-[var(--color-text-tertiary)] hover:text-[var(--color-primary-coral)]"
              onClick={() =>
                setPolicyNotice(
                  t('authRoutePages.t7'),
                )
              }
              type="button"
            >
               {t('authRoutePages.t12')} </button>
          </div>
        </div>
        {show('terms', termsError) ? <FieldError>{termsError}</FieldError> : null}
        {policyNotice ? (
          <p className="mt-2 text-sm font-medium text-[var(--color-text-tertiary)]" role="status">
            {policyNotice}
          </p>
        ) : null}

        {submitError ? (
          <p
            className="mt-5 rounded-lg bg-[var(--color-error-soft)] px-3.5 py-3 text-[15px] font-semibold leading-[1.55] text-[var(--color-error)]"
            role="alert"
          >
            {submitError}
          </p>
        ) : null}

        <button
          className={`mj-font-emphasis mt-6 min-h-14 w-full rounded-[10px] border text-[17px] transition-colors ${
            canSubmit
              ? 'border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] text-white hover:bg-[var(--color-primary-coral-hover)]'
              : 'cursor-not-allowed border-[var(--color-border-control)] bg-[var(--color-surface-subtle)] text-[var(--color-text-tertiary)]'
          }`}
          disabled={!canSubmit}
          type="submit"
        >
          {loading ? t('signup.submitting') : t('signup.submit')}
        </button>
        <p
          aria-live="polite"
          className="mt-3 text-sm font-semibold leading-[1.6] text-[var(--color-text-tertiary)]"
        >
          {allValid ? t('signup.allValid') : t('signup.fillRequired')}
        </p>
      </form>

      <p className="mt-6 border-t border-[var(--color-divider)] pt-[18px] text-[15px] font-medium text-[var(--color-text-tertiary)]">
        {t('signup.hasAccount')}{' '}
        <Link className="font-extrabold text-[var(--color-primary-coral)]" to="/login">
          {t('signup.goLogin')}
        </Link>
      </p>
    </main>
  )
}
