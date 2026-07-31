import {
  ArrowLeftIcon,
  ArrowRightIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@phosphor-icons/react'
import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import {
  isSignupRole,
  login,
  saveAuthSession,
  signup,
  type PreferredLanguage,
  type SignupRequest,
  type SignupRole,
} from '../../api/auth'
import {
  AlertBanner,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  IconButton,
  RadioGroup,
  Select,
  Stepper,
  TextField,
} from '../../components'

const languageOptions = [
  { label: '한국어', value: 'KOREAN' },
  { label: 'English', value: 'ENGLISH' },
] as const

const roleOptions = [
  { label: '팬', value: 'FAN' },
  { label: '인플루언서', value: 'INFLUENCER' },
  { label: '매니저', value: 'MANAGER' },
  { label: '솔로 인플루언서', value: 'SOLO_INFLUENCER' },
] as const

function isPreferredLanguage(value: string): value is PreferredLanguage {
  return value === 'KOREAN' || value === 'ENGLISH'
}

export function LoginPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [submitError, setSubmitError] = useState<string>()
  const [notice, setNotice] = useState<string>()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    setSubmitError(undefined)
    setNotice(undefined)
    setLoading(true)

    try {
      const response = await login({
        loginId: String(formData.get('loginId') ?? '').trim(),
        password: String(formData.get('password') ?? ''),
      })

      saveAuthSession(response, formData.get('remember') === 'on')
      const landingPath =
        response.role === 'FAN'
          ? '/fan/mypage/fan-meetings?status=upcoming'
          : response.role === 'INFLUENCER'
            ? '/influencer/fan-meetings'
            : '/manager/fan-meetings'
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
    <section className="grid min-h-full w-full items-center gap-10 lg:grid-cols-[minmax(0,1fr)_500px] lg:gap-20">
      <div className="hidden max-w-[620px] self-center lg:block lg:pl-6">
        <p className="text-sm font-extrabold tracking-[0.1em] text-[var(--color-text-secondary)]">
          MELLY FAN MEETING
        </p>
        <h2 className="mt-5 text-[clamp(2rem,3vw,2.55rem)] font-black tracking-[-0.045em] text-[var(--color-text-primary)]">
          다시 만나서 반가워요
        </h2>
        <p className="mt-5 text-base leading-7 text-[var(--color-text-secondary)]">
          로그인하고 좋아하는 인플루언서의 이벤트와 신청한 팬미팅을 확인해 보세요.
        </p>
      </div>

      <Card className="w-full overflow-hidden rounded-[14px] shadow-none">
        <CardHeader className="border-b-0 px-6 pb-0 pt-8 sm:px-10 sm:pt-10">
          <CardTitle as="h1" className="text-[28px] tracking-[-0.025em]">
            로그인
          </CardTitle>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
            MELLY 계정 정보를 입력해 주세요.
          </p>
        </CardHeader>

        <CardContent className="grid gap-6 px-6 pb-8 pt-0 sm:px-10 sm:pb-8">
          {submitError ? (
            <AlertBanner title="로그인하지 못했습니다" variant="error">
              {submitError}
            </AlertBanner>
          ) : null}
          {notice ? (
            <AlertBanner onDismiss={() => setNotice(undefined)} title="안내" variant="info">
              {notice}
            </AlertBanner>
          ) : null}

          <form className="grid gap-5" onSubmit={(event) => void handleSubmit(event)}>
            <TextField
              autoComplete="username"
              label="아이디"
              name="loginId"
              placeholder="아이디를 입력해 주세요"
              required
            />
            <TextField
              autoComplete="current-password"
              endAdornment={
                <IconButton
                  aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                  className="size-9 min-h-0 text-[var(--color-text-secondary)]"
                  icon={showPassword ? <EyeSlashIcon size={20} /> : <EyeIcon size={20} />}
                  onClick={() => setShowPassword((visible) => !visible)}
                  size="sm"
                />
              }
              label="비밀번호"
              name="password"
              placeholder="비밀번호를 입력해 주세요"
              required
              type={showPassword ? 'text' : 'password'}
            />

            <div className="flex items-center justify-between gap-4">
              <Checkbox
                className="size-4 rounded-[2px]"
                label="로그인 상태 유지"
                name="remember"
              />
              <button
                className="text-sm font-bold text-[var(--color-primary-coral)] hover:underline"
                onClick={() =>
                  setNotice('비밀번호 찾기 API와 화면은 현재 Notion API 정의서에 명시되어 있지 않습니다.')
                }
                type="button"
              >
                비밀번호 찾기
              </button>
            </div>

            <Button
              className="mt-1 min-h-[46px] w-full shadow-[var(--shadow-final-cta)]"
              loading={loading}
              size="lg"
              type="submit"
            >
              로그인
            </Button>
          </form>

          <p className="border-t border-[var(--color-divider)] pt-5 text-center text-sm text-[var(--color-text-secondary)]">
            아직 MELLY 계정이 없나요?{' '}
            <Link
              className="font-bold text-[var(--color-primary-coral)] hover:underline"
              to="/signup"
            >
              회원가입
            </Link>
          </p>
        </CardContent>
      </Card>
    </section>
  )
}

export function SignupPage() {
  const navigate = useNavigate()
  const formRef = useRef<HTMLFormElement>(null)
  const [passwordError, setPasswordError] = useState<string>()
  const [submitError, setSubmitError] = useState<string>()
  const [role, setRole] = useState<SignupRole>('FAN')
  const [step, setStep] = useState<0 | 1>(0)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false)
  const [policyNotice, setPolicyNotice] = useState<string>()

  function validateAccountFields(form: HTMLFormElement) {
    const accountFieldNames = [
      'email',
      'loginId',
      'nickname',
      'password',
      'passwordConfirm',
    ] as const

    for (const fieldName of accountFieldNames) {
      const field = form.elements.namedItem(fieldName)

      if (field instanceof HTMLInputElement && !field.checkValidity()) {
        field.reportValidity()
        return false
      }
    }

    const formData = new FormData(form)
    const password = String(formData.get('password') ?? '')
    const passwordConfirm = String(formData.get('passwordConfirm') ?? '')

    if (password !== passwordConfirm) {
      setPasswordError('비밀번호와 비밀번호 확인이 일치하지 않습니다.')
      return false
    }

    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setPasswordError('영문과 숫자를 조합해 8자 이상 입력해 주세요.')
      return false
    }

    setPasswordError(undefined)
    return true
  }

  function moveToPreferences() {
    const form = formRef.current

    if (!form || !validateAccountFields(form)) {
      return
    }

    setSubmitError(undefined)
    setStep(1)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!validateAccountFields(event.currentTarget)) {
      setStep(0)
      return
    }

    const formData = new FormData(event.currentTarget)
    const preferredLanguage = String(formData.get('preferredLanguage') ?? '')

    if (!isPreferredLanguage(preferredLanguage)) {
      setSubmitError('선호 언어를 선택해 주세요.')
      return
    }

    setSubmitError(undefined)
    setLoading(true)

    const request: SignupRequest = {
      loginId: String(formData.get('loginId') ?? '').trim(),
      password: String(formData.get('password') ?? ''),
      email: String(formData.get('email') ?? '').trim(),
      nickname: String(formData.get('nickname') ?? '').trim(),
      role,
      preferredLanguage,
      termsOfServiceAgreed: formData.get('termsOfServiceAgreed') === 'on',
      privacyPolicyAgreed: formData.get('privacyPolicyAgreed') === 'on',
    }

    try {
      await signup(request)
      navigate('/login', { replace: true })
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

  return (
    <section className="grid w-full items-center gap-10 lg:grid-cols-[minmax(0,1fr)_540px] lg:gap-20">
      <div className="hidden max-w-[620px] self-center lg:block">
        <p className="text-sm font-extrabold tracking-[0.1em] text-[var(--color-text-secondary)]">
          MELLY FAN MEETING
        </p>
        <h2 className="mt-5 text-[clamp(2rem,3vw,2.55rem)] font-black tracking-[-0.045em] text-[var(--color-text-primary)]">
          MELLY에서 팬미팅을 시작해 보세요.
        </h2>
        <p className="mt-5 text-base leading-7 text-[var(--color-text-secondary)]">
          계정을 만들고 좋아하는 인플루언서의 이벤트와 팬미팅에 참여할 수 있어요.
        </p>
      </div>

      <Card className="w-full overflow-hidden rounded-[14px] shadow-none">
        <CardHeader className="border-b-0 px-6 pb-2 pt-8 sm:px-10 sm:pt-10">
          <CardTitle as="h1" className="text-[28px] tracking-[-0.025em]">
            회원가입
          </CardTitle>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
            두 단계만 완료하면 MELLY 계정이 만들어져요.
          </p>
          <p className="mt-4 text-right text-xs text-[var(--color-text-secondary)]">
            <span className="font-bold text-[var(--color-primary-coral)]">*</span> 표시는 필수 입력
            항목입니다.
          </p>
        </CardHeader>

        <CardContent className="grid gap-6 px-6 pb-8 pt-2 sm:px-10 sm:pb-9">
          {submitError ? (
            <AlertBanner title="회원가입을 완료하지 못했습니다" variant="error">
              {submitError}
            </AlertBanner>
          ) : null}
          {policyNotice ? (
            <AlertBanner
              onDismiss={() => setPolicyNotice(undefined)}
              title="약관 안내"
              variant="info"
            >
              {policyNotice}
            </AlertBanner>
          ) : null}

          <form
            className="grid gap-6"
            onSubmit={(event) => void handleSubmit(event)}
            ref={formRef}
          >
            <Stepper
              activeStep={step}
              className="rounded-[var(--radius-control)] bg-[var(--color-surface-page)] p-4 text-center"
              steps={[
                { label: '계정 정보' },
                { label: '프로필 설정' },
              ]}
            />

            <div className={step === 0 ? 'grid gap-5' : 'hidden'}>
              <TextField
                autoComplete="email"
                label="이메일"
                name="email"
                placeholder="example@email.com"
                required
                type="email"
              />
              <TextField
                autoComplete="username"
                label="아이디"
                name="loginId"
                placeholder="아이디를 입력해 주세요"
                required
              />
              <TextField
                label="닉네임"
                name="nickname"
                placeholder="닉네임을 입력해 주세요"
                required
              />
              <TextField
                autoComplete="new-password"
                endAdornment={
                  <IconButton
                    aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                    className="size-9 min-h-0 text-[var(--color-text-secondary)]"
                    icon={showPassword ? <EyeSlashIcon size={20} /> : <EyeIcon size={20} />}
                    onClick={() => setShowPassword((visible) => !visible)}
                    size="sm"
                  />
                }
                helperText="영문과 숫자를 조합해 8자 이상 입력해 주세요."
                label="비밀번호"
                minLength={8}
                name="password"
                placeholder="비밀번호를 입력해 주세요"
                required
                type={showPassword ? 'text' : 'password'}
              />
              <TextField
                autoComplete="new-password"
                endAdornment={
                  <IconButton
                    aria-label={showPasswordConfirm ? '비밀번호 확인 숨기기' : '비밀번호 확인 보기'}
                    className="size-9 min-h-0 text-[var(--color-text-secondary)]"
                    icon={showPasswordConfirm ? <EyeSlashIcon size={20} /> : <EyeIcon size={20} />}
                    onClick={() => setShowPasswordConfirm((visible) => !visible)}
                    size="sm"
                  />
                }
                error={passwordError}
                label="비밀번호 확인"
                minLength={8}
                name="passwordConfirm"
                placeholder="비밀번호를 다시 입력해 주세요"
                required
                type={showPasswordConfirm ? 'text' : 'password'}
              />
              <Button
                className="mt-1 w-full"
                onClick={moveToPreferences}
                size="lg"
                trailingIcon={<ArrowRightIcon aria-hidden="true" size={18} weight="bold" />}
              >
                다음
              </Button>
            </div>

            <div className={step === 1 ? 'grid gap-5' : 'hidden'}>
              <Select
                defaultValue=""
                label="선호 언어"
                name="preferredLanguage"
                options={languageOptions}
                placeholder="언어를 선택해 주세요"
                required
              />
              <RadioGroup
                appearance="button"
                legend="역할"
                name="role"
                onValueChange={(value) => {
                  if (isSignupRole(value)) {
                    setRole(value)
                  }
                }}
                options={roleOptions}
                required
                value={role}
              />
              <div className="grid gap-4 border-t border-[var(--color-divider)] pt-5">
                <div className="flex items-start justify-between gap-3">
                  <Checkbox
                    className="size-4 rounded-[2px]"
                    label="이용약관에 동의합니다."
                    name="termsOfServiceAgreed"
                    required
                  />
                  <button
                    className="shrink-0 text-sm font-bold text-[var(--color-primary-coral)] hover:underline"
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
                <div className="flex items-start justify-between gap-3">
                  <Checkbox
                    className="size-4 rounded-[2px]"
                    label="개인정보 처리방침에 동의합니다."
                    name="privacyPolicyAgreed"
                    required
                  />
                  <button
                    className="shrink-0 text-sm font-bold text-[var(--color-primary-coral)] hover:underline"
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
              <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
                <Button
                  leadingIcon={<ArrowLeftIcon aria-hidden="true" size={18} weight="bold" />}
                  onClick={() => setStep(0)}
                  size="lg"
                  variant="outline"
                >
                  이전
                </Button>
                <Button
                  className="min-h-[46px] w-full shadow-[var(--shadow-final-cta)]"
                  loading={loading}
                  size="lg"
                  type="submit"
                >
                  회원가입
                </Button>
              </div>
            </div>
          </form>

          <p className="border-t border-[var(--color-divider)] pt-4 text-center text-sm text-[var(--color-text-secondary)]">
            이미 계정이 있나요?{' '}
            <Link
              className="font-bold text-[var(--color-primary-coral)] hover:underline"
              to="/login"
            >
              로그인
            </Link>
          </p>
        </CardContent>
      </Card>
    </section>
  )
}
