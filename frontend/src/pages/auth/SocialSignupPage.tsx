import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { saveAuthSession, type PreferredLanguage } from '../../api/auth'
import {
  socialSignup,
  toProviderPath,
  SOCIAL_PROVIDER_LABELS,
  type SocialLoginResult,
} from '../../api/socialAuth'
import { AlertBanner, Button, Card, CardContent, Select, TextField } from '../../components'

const languageOptions = [
  { label: '한국어', value: 'KOREAN' },
  { label: 'English', value: 'ENGLISH' },
]

function isPreferredLanguage(value: string): value is PreferredLanguage {
  return value === 'KOREAN' || value === 'ENGLISH'
}

/**
 * 소셜 신규 가입 추가정보 화면이다. (`/signup/social`)
 *
 * 콜백 화면이 `SIGNUP_REQUIRED`를 받았을 때 라우터 state로 결과를 넘겨 준다. 주소에 담지 않는
 * 이유는 `socialToken`이 5분 만료 자격증명이라 히스토리·공유 링크에 남지 않아야 하기 때문이다.
 *
 * 역할과 비밀번호는 받지 않는다. 서버가 역할을 FAN으로 고정하고 소셜 계정은 비밀번호가 없다.
 */
export function SocialSignupPage() {
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

  const nicknameError = nickname.trim() ? '' : '닉네임을 입력해 주세요.'
  const emailError = !needsEmail
    ? ''
    : !email.trim()
      ? '이메일을 입력해 주세요.'
      : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ? ''
        : '올바른 이메일 형식을 입력해 주세요.'
  const languageError = isPreferredLanguage(language) ? '' : '선호 언어를 선택해 주세요.'
  const termsError = termsAgreed && privacyAgreed ? '' : '필수 약관에 동의해 주세요.'
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
      navigate('/fan/mypage/fan-meetings?status=upcoming', { replace: true })
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === 'SOCIAL_TOKEN_INVALID') {
        // 5분이 지나 임시 토큰이 만료된 경우다. 같은 화면에서 재시도할 방법이 없다.
        setSubmitError(
          '입력 시간이 초과되어 처음부터 다시 진행해야 합니다. 로그인 화면에서 다시 시도해 주세요.',
        )
        return
      }
      setSubmitError(
        reason instanceof ApiError
          ? reason.message
          : '가입을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  // state 없이 직접 들어오거나 새로고침한 경우다. 임시 토큰이 없어 진행할 수 없다.
  if (!result) return <Navigate replace to="/login" />

  const providerLabel = SOCIAL_PROVIDER_LABELS[toProviderPath(result.provider)]

  return (
    <main className="mx-auto grid w-full max-w-xl gap-6 py-12">
      <div>
        <p className="text-[13px] font-extrabold tracking-[0.08em] text-[var(--color-primary-coral)]">
          {providerLabel} 계정으로 시작
        </p>
        <h1 className="mt-3.5 text-[32px] font-black tracking-[-0.045em] [text-wrap:balance]">
          거의 다 됐어요
        </h1>
        {/* 서버가 상황에 맞는 안내 문구를 내려 준다. 이메일 미제공 안내도 여기에 담겨 온다. */}
        <p className="mt-3 text-[17px] font-medium leading-[1.7] text-[var(--color-text-body)]">
          {result.message ?? '닉네임과 사용할 언어만 정하면 바로 시작할 수 있어요.'}
        </p>
      </div>

      <Card>
        <CardContent className="p-7">
          <form className="grid gap-[18px]" onSubmit={(event) => void handleSubmit(event)}>
            <TextField
              label="닉네임"
              onChange={(event) => setNickname(event.currentTarget.value)}
              placeholder="닉네임을 입력해 주세요"
              value={nickname}
            />

            {needsEmail ? (
              <TextField
                label="이메일"
                onChange={(event) => setEmail(event.currentTarget.value)}
                placeholder="example@email.com"
                type="email"
                value={email}
              />
            ) : (
              // 공급자에게 받은 이메일은 수정할 수 없으므로 확인용으로만 보여 준다.
              <div>
                <p className="text-sm font-bold text-[var(--color-text-primary)]">이메일</p>
                <p className="mt-2 text-base font-semibold text-[var(--color-text-secondary)]">
                  {result.email ?? '-'}
                </p>
              </div>
            )}

            <Select
              label="선호 언어"
              onChange={(event) => setLanguage(event.currentTarget.value)}
              options={[{ label: '언어를 선택해 주세요', value: '' }, ...languageOptions]}
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
                  이용약관에 동의합니다.{' '}
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
                  개인정보 처리방침에 동의합니다.{' '}
                  <span className="text-[var(--color-primary-coral)]">*</span>
                </span>
              </label>
            </div>

            {submitError ? (
              <AlertBanner title="가입을 완료하지 못했습니다" variant="error">
                {submitError}
              </AlertBanner>
            ) : null}

            <Button disabled={!canSubmit} loading={submitting} size="lg" type="submit">
              시작하기
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
