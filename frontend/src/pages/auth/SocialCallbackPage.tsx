import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession, saveAuthSession } from '../../api/auth'
import { consumeOauthReturnTo, consumeOauthState } from '../../api/oauthState'
import {
  connectMySocialAccount,
  isSocialProviderPath,
  socialLogin,
  SOCIAL_PROVIDER_LABELS,
  type SocialLoginResult,
} from '../../api/socialAuth'
import { AlertBanner, Button, Card, CardContent, Spinner } from '../../components'

/** 소셜 로그인 실패를 사용자에게 알릴 때 쓰는 문구다. */
type CallbackFailure = {
  message: string
  /** 인가 코드를 다시 받아야 하는 실패다. 재시도 버튼이 로그인 화면으로 보낸다. */
  restartFromLogin: boolean
}

/**
 * 상태 코드로만 판별해야 하는 두 응답의 한국어 문구를 고른다.
 *
 * 기존 auth 예외 처리기가 code 없이 영문 메시지를 내려보내므로(`ApiError.code`가 HTTP_403·
 * HTTP_429로 잡힌다) detail을 그대로 띄우면 사용자에게 영어가 노출된다.
 * 그 두 경우만 프론트 문구로 바꾸고, 나머지는 서버가 준 한국어 detail을 그대로 쓴다.
 */
function messageFor(error: ApiError): string {
  if (error.status === 403) return '이 계정은 현재 사용할 수 없습니다. 운영팀에 문의해 주세요.'
  if (error.status === 429) {
    return '비밀번호 확인 시도가 너무 많아 잠시 차단되었습니다. 잠시 후 다시 시도해 주세요.'
  }

  return error.message
}

/**
 * 공급자 로그인 후 돌아오는 화면이다. (`/oauth/callback/:provider`)
 *
 * 이 경로는 구글·카카오·네이버 콘솔에 등록된 redirect_uri와 같아야 하므로 **바꾸면 안 된다.**
 *
 * 인가 코드는 1회용이고 수명이 짧아 이 화면에서 **즉시** 로그인 API를 호출한다. 그래서 별도
 * 확인 버튼을 두지 않고 로딩만 보여 준다. 새로고침으로 같은 코드를 다시 쓰면 서버가 거부하므로,
 * 실패 시 재시도는 로그인 화면부터 다시 시작하게 안내한다.
 */
export function SocialCallbackPage() {
  const navigate = useNavigate()
  const { provider: providerParam } = useParams()
  const [searchParams] = useSearchParams()
  const [failure, setFailure] = useState<CallbackFailure>()
  // 같은 코드를 두 번 보내지 않도록 1회만 통과시킨다. StrictMode 이중 마운트도 여기서 막힌다.
  const startedRef = useRef(false)

  const provider = isSocialProviderPath(providerParam) ? providerParam : undefined
  const providerLabel = provider ? SOCIAL_PROVIDER_LABELS[provider] : ''

  useEffect(() => {
    if (!provider || startedRef.current) return
    startedRef.current = true

    const code = searchParams.get('code')
    const state = searchParams.get('state')
    // 사용자가 공급자 화면에서 취소하면 code 없이 error 파라미터만 돌아온다.
    const providerError = searchParams.get('error')

    if (providerError || !code) {
      setFailure({
        message: providerError
          ? `${providerLabel} 로그인이 취소되었거나 완료되지 않았습니다.`
          : '인가 코드를 받지 못했습니다. 다시 시도해 주세요.',
        restartFromLogin: true,
      })
      return
    }

    // state는 위조 요청을 걸러내는 유일한 수단이므로 API 호출 전에 대조한다.
    if (!consumeOauthState(provider, state)) {
      setFailure({
        message: '로그인 요청을 확인할 수 없습니다. 보안을 위해 처음부터 다시 시도해 주세요.',
        restartFromLogin: true,
      })
      return
    }

    const returnTo = consumeOauthReturnTo(provider)
    const controller = new AbortController()

    // 마이페이지에서 시작한 '계정 추가 연결' 흐름은 로그인 API가 아니라 연결 API를 쓴다.
    if (returnTo) {
      const authToken = getAuthSession()?.accessToken
      if (!authToken) {
        setFailure({
          message: '로그인이 만료되었습니다. 다시 로그인한 뒤 연결해 주세요.',
          restartFromLogin: true,
        })
        return
      }

      void connectMySocialAccount(provider, { code, state: state ?? '' }, authToken, controller.signal)
        .then(() => {
          navigate(returnTo, { replace: true, state: { socialConnected: providerLabel } })
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return
          setFailure({
            message:
              reason instanceof ApiError
                ? messageFor(reason)
                : '소셜 계정을 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
            restartFromLogin: false,
          })
        })

      return () => controller.abort()
    }

    void socialLogin(provider, { code, state: state ?? '' }, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        handleResult(result)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setFailure({
          message:
            reason instanceof ApiError
              ? messageFor(reason)
              : '소셜 로그인을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
          restartFromLogin: true,
        })
      })

    return () => controller.abort()
    // provider·searchParams가 정해진 첫 렌더에서 한 번만 수행한다. 나머지 값은 그 시점 기준이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider])

  /** 서버가 알려 준 세 갈래(status)에 따라 다음 화면을 정한다. */
  function handleResult(result: SocialLoginResult) {
    if (result.status === 'LOGIN' && result.login) {
      // 기존 로그인과 동일한 형태라 세션 저장 방식도 같다.
      saveAuthSession(result.login, false)
      const landing =
        result.login.role === 'FAN'
          ? '/fan/mypage/fan-meetings?status=upcoming'
          : result.login.role === 'INFLUENCER' || result.login.role === 'SOLO_INFLUENCER'
            ? '/influencer/fan-meetings'
            : '/manager/fan-meetings'
      navigate(landing, { replace: true })
      return
    }

    if (result.status === 'SIGNUP_REQUIRED' && result.socialToken) {
      // socialToken은 5분 만료라 주소가 아니라 라우터 state로 넘겨 새로고침 재사용을 막는다.
      navigate('/signup/social', { replace: true, state: result })
      return
    }

    if (result.status === 'LINK_REQUIRED' && result.socialToken) {
      navigate('/login/social-link', { replace: true, state: result })
      return
    }

    setFailure({
      message: '소셜 로그인 응답을 이해할 수 없습니다. 처음부터 다시 시도해 주세요.',
      restartFromLogin: true,
    })
  }

  // 지원하지 않는 공급자 경로로 들어온 경우다. 화면을 그리지 않고 로그인으로 되돌린다.
  if (!provider) return <Navigate replace to="/login" />

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6 py-16">
      <Card>
        <CardContent className="grid gap-6 p-8">
          {failure ? (
            <>
              <AlertBanner title={`${providerLabel} 로그인을 완료하지 못했습니다`} variant="error">
                {failure.message}
              </AlertBanner>
              <Button
                className="w-full"
                onClick={() => navigate(failure.restartFromLogin ? '/login' : '/', { replace: true })}
                size="lg"
              >
                {failure.restartFromLogin ? '로그인 화면으로 돌아가기' : '홈으로 가기'}
              </Button>
            </>
          ) : (
            <div className="grid min-h-40 place-items-center gap-4 text-center">
              <Spinner label={`${providerLabel} 로그인을 확인하는 중`} size="lg" />
              <p className="text-sm font-medium text-[var(--color-text-secondary)]">
                이 화면을 닫거나 새로고침하지 말아 주세요.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
