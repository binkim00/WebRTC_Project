import { EyeIcon, EyeSlashIcon } from '@phosphor-icons/react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import {
  clearAuthSession,
  login,
  saveAuthSession,
  signup,
  type PreferredLanguage,
  type SignupRequest,
  type SignupRole,
} from '../../api/auth'
import { maskEmail } from '../../api/emailVerifications'
import { isEmailVerificationEnabled } from '../../config/features'
import { AlertBanner, EmailVerificationNotice } from '../../components'

const languageOptions = [
  { label: '한국어', value: 'KOREAN' },
  { label: 'English', value: 'ENGLISH' },
  { label: '日本語', value: 'JAPANESE' },
  { label: '中文', value: 'CHINESE' },
  { label: 'Tiếng Việt', value: 'VIETNAMESE' },
] as const

/** 화면 라벨은 서비스 전반의 명칭(1인 인플루언서)을 따르고 값은 백엔드 enum을 그대로 쓴다. */
const roleOptions: readonly { label: string; value: SignupRole; note: string }[] = [
  {
    label: '팬',
    value: 'FAN',
    note: '좋아하는 크리에이터의 이벤트에 응모하고 1:1 영상 팬미팅에 참여합니다.',
  },
  {
    label: '인플루언서',
    value: 'INFLUENCER',
    note: '소속 조직의 매니저가 만든 팬미팅을 진행합니다. 가입 후 조직 초대를 받아 합류하세요.',
  },
  {
    label: '1인 인플루언서',
    value: 'SOLO_INFLUENCER',
    note: '소속 조직 없이 팬미팅을 직접 만들고 진행합니다.',
  },
  {
    label: '매니저',
    value: 'MANAGER',
    note: '조직을 만들고 인플루언서를 초대해 팬미팅 운영을 관리합니다.',
  },
]

// 선택지가 늘어나도 검증이 뒤처지지 않도록 languageOptions를 그대로 기준으로 삼는다.
function isPreferredLanguage(value: string): value is PreferredLanguage {
  return languageOptions.some((option) => option.value === value)
}

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
      const landingPath =
        safeRequestedPath ?? (response.role === 'FAN'
          ? '/fan/mypage/fan-meetings?status=upcoming'
          : response.role === 'INFLUENCER'
            ? '/influencer/fan-meetings'
            : '/manager/fan-meetings')
      navigate(landingPath, { replace: true })
    } catch (error: unknown) {
      setSubmitError(
        error instanceof ApiError || error instanceof TypeError
          ? error.message
          : '로그인 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto grid w-full max-w-[1100px] items-center gap-9 py-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-[72px] lg:py-16">
      <section aria-labelledby="lg-intro" className="min-w-0">
        <p className="text-[13px] font-extrabold tracking-[0.08em] text-[var(--color-primary-coral)]">
          MELLY FAN MEETING
        </p>
        <h1
          className="mt-4 text-[clamp(2rem,3.6vw,2.75rem)] font-black leading-[1.16] tracking-[-0.05em] text-[var(--color-text-primary)] [text-wrap:balance]"
          id="lg-intro"
        >
          다시 만나서 반가워요
        </h1>
        <p className="mt-4 max-w-[38ch] text-lg font-medium leading-[1.7] text-[var(--color-text-body)]">
          로그인하고 좋아하는 인플루언서의 이벤트와 신청한 팬미팅을 확인해 보세요.
        </p>
      </section>

      <section
        aria-labelledby="lg-form"
        className="min-w-0 rounded-xl border border-[var(--color-divider)] p-7"
      >
        <h2 className="text-[22px] font-extrabold tracking-[-0.032em]" id="lg-form">
          로그인
        </h2>
        <p className="mt-[7px] text-[15px] font-medium text-[var(--color-text-tertiary)]">
          MELLY 계정 정보를 입력해 주세요.
        </p>

        {notice ? (
          <AlertBanner
            className="mt-5"
            onDismiss={() => setNotice(undefined)}
            title="안내"
            variant="info"
          >
            {notice}
          </AlertBanner>
        ) : null}

        <form className="mt-6" onSubmit={(event) => void handleSubmit(event)}>
          <label className="block">
            <span className="block text-sm font-bold text-[var(--color-text-primary)]">
              아이디
            </span>
            <input
              autoComplete="username"
              className="mt-2 min-h-[50px] w-full rounded-lg border border-[var(--color-border-control)] bg-white px-[13px] text-base font-semibold text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)] focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]"
              name="loginId"
              onChange={(event) => setLoginId(event.currentTarget.value)}
              placeholder="아이디를 입력해 주세요"
              value={loginId}
            />
          </label>

          <label className="mt-[18px] block">
            <span className="block text-sm font-bold text-[var(--color-text-primary)]">
              비밀번호
            </span>
            <span className="relative mt-2 block">
              <input
                autoComplete="current-password"
                className="min-h-[50px] w-full rounded-lg border border-[var(--color-border-control)] bg-white pl-[13px] pr-[52px] text-base font-semibold text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)] focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]"
                name="password"
                onChange={(event) => setPassword(event.currentTarget.value)}
                placeholder="비밀번호를 입력해 주세요"
                type={showPassword ? 'text' : 'password'}
                value={password}
              />
              <button
                aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
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
              title="비밀번호 재설정 API가 제공되면 사용할 수 있습니다."
              type="button"
            >
              비밀번호 찾기 준비 중
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
            title={filled ? undefined : '아이디와 비밀번호를 입력해 주세요.'}
            type="submit"
          >
            {loading ? '로그인 중' : '로그인'}
          </button>
        </form>

        <p className="mt-5 border-t border-[var(--color-divider)] pt-[18px] text-[15px] font-medium text-[var(--color-text-tertiary)]">
          아직 MELLY 계정이 없나요?{' '}
          <Link className="font-extrabold text-[var(--color-primary-coral)]" to="/signup">
            회원가입
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
    ? '이메일을 입력해 주세요.'
    : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ? '올바른 이메일 형식을 입력해 주세요.'
      : ''
  const loginIdError = loginId.trim() ? '' : '아이디를 입력해 주세요.'
  const nicknameError = nickname.trim() ? '' : '닉네임을 입력해 주세요.'
  const passwordError = !password
    ? '비밀번호를 입력해 주세요.'
    : !/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)
      ? '영문과 숫자를 포함해 8자 이상 입력해 주세요.'
      : ''
  const passwordConfirmError = !passwordConfirm
    ? '비밀번호를 다시 입력해 주세요.'
    : passwordConfirm === password
      ? ''
      : '비밀번호가 일치하지 않습니다.'
  const languageError = isPreferredLanguage(language) ? '' : '선호 언어를 선택해 주세요.'
  const roleError = role ? '' : '역할을 선택해 주세요.'
  const termsError = termsAgreed && privacyAgreed ? '' : '필수 약관에 동의해 주세요.'

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
          state: { notice: '가입이 완료되었어요. 로그인해 주세요.' },
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
            notice: `가입이 완료되었어요. 로그인 후 마이페이지에서 ${maskEmail(request.email)} 주소로 인증 메일을 보낼 수 있어요.`,
          },
        })
      }
    } catch (error: unknown) {
      setSubmitError(
        error instanceof ApiError || error instanceof TypeError
          ? error.message
          : '회원가입 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
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
        aria-label={shown ? `${targetLabel} 숨기기` : `${targetLabel} 보기`}
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
          가입이 완료되었어요
        </h1>
        <p className="mt-3 text-[17px] font-medium leading-[1.7] text-[var(--color-text-body)]">
          마지막으로 이메일 인증만 마치면 바로 로그인할 수 있어요.
        </p>

        <section className="mt-8 rounded-xl border border-[var(--color-divider)] p-7">
          <EmailVerificationNotice
            autoSend
            email={phase.email}
            onVerified={() =>
              leaveVerifyingPhase('이메일 인증이 완료되었어요. 이제 로그인해 주세요.')
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
                ? '가입이 완료되었어요. 이메일 인증은 로그인 후 마이페이지에서도 할 수 있고, 팬미팅 응모 전에는 인증이 필요해요.'
                : '가입이 완료되었어요. 이메일 인증은 로그인 후 마이페이지에서도 할 수 있어요.',
            )
          }
          type="button"
        >
          나중에 인증하고 로그인하러 가기
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
        MELLY에서 팬미팅을 시작해 보세요
      </h1>
      <p className="mt-3 text-[17px] font-medium leading-[1.7] text-[var(--color-text-body)]">
        계정을 만들고 좋아하는 인플루언서의 이벤트와 팬미팅에 참여할 수 있어요.
      </p>

      <section
        aria-labelledby="su-form"
        className="mt-8 border-t border-[var(--color-divider)] pt-7"
      >
        <h2 className="text-[22px] font-extrabold tracking-[-0.032em]" id="su-form">
          회원가입
        </h2>
        <p className="mt-[7px] text-[15px] font-medium text-[var(--color-text-tertiary)]">
          아래 정보를 입력해 MELLY 계정을 만들어 주세요.
        </p>
      </section>

      <form className="mt-6" onSubmit={(event) => void handleSubmit(event)}>
        <p className="mb-5 text-sm font-semibold text-[var(--color-text-tertiary)]">
          <span className="text-[var(--color-primary-coral)]">*</span> 표시는 필수 입력
          항목입니다.
        </p>

        <label className="block">
          <FieldLabel>이메일</FieldLabel>
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
              <FieldLabel>아이디</FieldLabel>
              <input
                aria-invalid={show('loginId', loginIdError)}
                autoComplete="username"
                className={`${signupInputClass} ${fieldBorderClass(show('loginId', loginIdError))}`}
                onBlur={markTouched('loginId')}
                onChange={(event) => setLoginId(event.currentTarget.value)}
                placeholder="아이디를 입력해 주세요"
                value={loginId}
              />
            </label>
            {show('loginId', loginIdError) ? <FieldError>{loginIdError}</FieldError> : null}
          </div>
          <div>
            <label className="block">
              <FieldLabel>닉네임</FieldLabel>
              <input
                aria-invalid={show('nickname', nicknameError)}
                autoComplete="nickname"
                className={`${signupInputClass} ${fieldBorderClass(show('nickname', nicknameError))}`}
                onBlur={markTouched('nickname')}
                onChange={(event) => setNickname(event.currentTarget.value)}
                placeholder="닉네임을 입력해 주세요"
                value={nickname}
              />
            </label>
            {show('nickname', nicknameError) ? <FieldError>{nicknameError}</FieldError> : null}
          </div>
        </div>

        <label className="mt-[18px] block">
          <FieldLabel>비밀번호</FieldLabel>
          <span className="relative mt-2 block">
            <input
              aria-invalid={show('password', passwordError)}
              autoComplete="new-password"
              className={`${signupInputClass} mt-0 pr-[52px] ${fieldBorderClass(show('password', passwordError))}`}
              onBlur={markTouched('password')}
              onChange={(event) => setPassword(event.currentTarget.value)}
              placeholder="비밀번호를 입력해 주세요"
              type={showPassword ? 'text' : 'password'}
              value={password}
            />
            {passwordToggle(showPassword, () => setShowPassword((visible) => !visible), '비밀번호')}
          </span>
        </label>
        {show('password', passwordError) ? (
          <FieldError>{passwordError}</FieldError>
        ) : (
          <p className="mt-[7px] text-sm font-medium text-[var(--color-text-tertiary)]">
            영문과 숫자를 조합해 8자 이상 입력해 주세요.
          </p>
        )}

        <label className="mt-[18px] block">
          <FieldLabel>비밀번호 확인</FieldLabel>
          <span className="relative mt-2 block">
            <input
              aria-invalid={show('passwordConfirm', passwordConfirmError)}
              autoComplete="new-password"
              className={`${signupInputClass} mt-0 pr-[52px] ${fieldBorderClass(show('passwordConfirm', passwordConfirmError))}`}
              onBlur={markTouched('passwordConfirm')}
              onChange={(event) => setPasswordConfirm(event.currentTarget.value)}
              placeholder="비밀번호를 다시 입력해 주세요"
              type={showPasswordConfirm ? 'text' : 'password'}
              value={passwordConfirm}
            />
            {passwordToggle(
              showPasswordConfirm,
              () => setShowPasswordConfirm((visible) => !visible),
              '비밀번호 확인',
            )}
          </span>
        </label>
        {show('passwordConfirm', passwordConfirmError) ? (
          <FieldError>{passwordConfirmError}</FieldError>
        ) : null}

        <label className="mt-[18px] block">
          <FieldLabel>선호 언어</FieldLabel>
          <select
            aria-invalid={show('language', languageError)}
            className={`mt-2 min-h-[50px] w-full rounded-lg border bg-white px-[11px] text-base font-semibold text-[var(--color-text-primary)] outline-none focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)] ${fieldBorderClass(show('language', languageError))}`}
            onBlur={markTouched('language')}
            onChange={(event) => setLanguage(event.currentTarget.value)}
            value={language}
          >
            <option value="">언어를 선택해 주세요</option>
            {languageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {show('language', languageError) ? <FieldError>{languageError}</FieldError> : null}

        <fieldset className="mt-[22px] border-0 p-0">
          <legend className="p-0 text-sm font-bold text-[var(--color-text-primary)]">
            역할 <span className="text-[var(--color-primary-coral)]">*</span>
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
                  {option.label}
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
            {selectedRole.note}
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
                이용약관에 동의합니다. <span className="text-[var(--color-primary-coral)]">*</span>
              </span>
            </label>
            <button
              className="whitespace-nowrap text-[15px] font-bold text-[var(--color-text-tertiary)] hover:text-[var(--color-primary-coral)]"
              onClick={() =>
                setPolicyNotice(
                  '이용약관 상세 URL은 현재 라우팅·API 정의서에 명시되어 있지 않습니다.',
                )
              }
              type="button"
            >
              내용 보기
            </button>
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
                개인정보 처리방침에 동의합니다.{' '}
                <span className="text-[var(--color-primary-coral)]">*</span>
              </span>
            </label>
            <button
              className="whitespace-nowrap text-[15px] font-bold text-[var(--color-text-tertiary)] hover:text-[var(--color-primary-coral)]"
              onClick={() =>
                setPolicyNotice(
                  '개인정보 처리방침 상세 URL은 현재 라우팅·API 정의서에 명시되어 있지 않습니다.',
                )
              }
              type="button"
            >
              내용 보기
            </button>
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
          {loading ? '가입 처리 중' : '회원가입'}
        </button>
        <p
          aria-live="polite"
          className="mt-3 text-sm font-semibold leading-[1.6] text-[var(--color-text-tertiary)]"
        >
          {allValid ? '입력이 모두 확인되었습니다.' : '필수 항목을 모두 입력하면 가입할 수 있어요.'}
        </p>
      </form>

      <p className="mt-6 border-t border-[var(--color-divider)] pt-[18px] text-[15px] font-medium text-[var(--color-text-tertiary)]">
        이미 계정이 있나요?{' '}
        <Link className="font-extrabold text-[var(--color-primary-coral)]" to="/login">
          로그인
        </Link>
      </p>
    </main>
  )
}
