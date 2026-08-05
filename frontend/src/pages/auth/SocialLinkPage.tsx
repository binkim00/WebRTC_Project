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

      const landing =
        login.role === 'FAN'
          ? '/fan/mypage/fan-meetings?status=upcoming'
          : login.role === 'INFLUENCER' || login.role === 'SOLO_INFLUENCER'
            ? '/influencer/fan-meetings'
            : '/manager/fan-meetings'
      navigate(landing, { replace: true })
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
            '입력 시간이 초과되어 처음부터 다시 진행해야 합니다. 로그인 화면에서 다시 시도해 주세요.',
          )
          return
        }
        // 반복 실패로 차단된 경우다. 옛 예외 처리기가 영문 메시지를 주므로 문구를 직접 넣는다.
        if (reason.status === 429) {
          setSubmitError(
            '비밀번호 확인 시도가 너무 많아 잠시 차단되었습니다. 잠시 후 다시 시도해 주세요.',
          )
          return
        }
        if (reason.status === 403) {
          setSubmitError('이 계정은 현재 사용할 수 없습니다. 운영팀에 문의해 주세요.')
          return
        }
        setSubmitError(reason.message)
        return
      }
      setSubmitError('계정을 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!result) return <Navigate replace to="/login" />

  const providerLabel = SOCIAL_PROVIDER_LABELS[toProviderPath(result.provider)]

  return (
    <main className="mx-auto grid w-full max-w-xl gap-6 py-12">
      <div>
        <p className="text-[13px] font-extrabold tracking-[0.08em] text-[var(--color-primary-coral)]">
          {providerLabel} 계정 연결
        </p>
        <h1 className="mt-3.5 text-[32px] font-black tracking-[-0.045em] [text-wrap:balance]">
          이미 가입한 계정이 있어요
        </h1>
        <p className="mt-3 text-[17px] font-medium leading-[1.7] text-[var(--color-text-body)]">
          {result.message ??
            `${result.maskedEmail ?? '기존 계정'}의 비밀번호를 입력하면 ${providerLabel} 계정을 연결해 드릴게요.`}
        </p>
      </div>

      <Card>
        <CardContent className="p-7">
          <form className="grid gap-[18px]" onSubmit={(event) => void handleSubmit(event)}>
            {/* 어느 계정에 연결되는지 확인할 수 있어야 한다. 서버가 마스킹한 값을 그대로 쓴다. */}
            {result.maskedEmail ? (
              <div>
                <p className="text-sm font-bold text-[var(--color-text-primary)]">연결할 계정</p>
                <p className="mt-2 text-base font-extrabold">{result.maskedEmail}</p>
              </div>
            ) : null}

            <TextField
              autoComplete="current-password"
              error={passwordError}
              label="비밀번호"
              onChange={(event) => setPassword(event.currentTarget.value)}
              placeholder="기존 계정의 비밀번호"
              type="password"
              value={password}
            />

            {submitError ? (
              <AlertBanner title="계정을 연결하지 못했습니다" variant="error">
                {submitError}
              </AlertBanner>
            ) : null}

            <Button disabled={!password || submitting} loading={submitting} size="lg" type="submit">
              연결하고 로그인
            </Button>
            <Button
              onClick={() => navigate('/login', { replace: true })}
              type="button"
              variant="secondary"
            >
              다른 방법으로 로그인
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
