import { useState } from 'react'
import { ApiError } from '../../api/ApiError'
import { startSocialAuth } from '../../api/oauthState'
import {
  SOCIAL_PROVIDERS,
  SOCIAL_PROVIDER_LABELS,
  type SocialProviderPath,
} from '../../api/socialAuth'
import { AlertBanner } from '../feedback/AlertBanner'
import { SocialProviderLogo } from './SocialProviderLogo'

/** 공급자별 버튼 색이다. 각 브랜드 가이드의 대표색을 따른다. */
const providerStyles: Record<SocialProviderPath, string> = {
  google: 'border-[var(--color-border-control)] bg-white text-[var(--color-text-primary)]',
  kakao: 'border-[#FEE500] bg-[#FEE500] text-[#191600]',
  naver: 'border-[#03C75A] bg-[#03C75A] text-white',
}

/**
 * 소셜 로그인 시작 버튼 묶음이다.
 *
 * 버튼을 누르면 서버에서 인증 URL을 받아 공급자 화면으로 이동한다. URL을 프론트에서 만들지 않는
 * 이유는 client_id·redirect_uri·scope가 서버 설정에만 있고, redirect_uri가 한 글자만 달라도
 * 공급자가 거부하기 때문이다.
 *
 * @param returnTo 마이페이지에서 계정을 추가 연결할 때 돌아올 경로다. 로그인 흐름에서는 생략한다.
 */
export function SocialLoginButtons({
  returnTo,
  labelPrefix = '{provider}로 시작하기',
}: {
  returnTo?: string
  /** 버튼 문구 형식이다. `{provider}`가 공급자 이름으로 바뀐다. */
  labelPrefix?: string
}) {
  // 어떤 공급자로 이동 중인지 표시해, 느린 네트워크에서 여러 번 누르는 것을 막는다.
  const [pending, setPending] = useState<SocialProviderPath>()
  const [error, setError] = useState<string>()

  async function handleStart(provider: SocialProviderPath) {
    if (pending) return

    setPending(provider)
    setError(undefined)
    try {
      await startSocialAuth(provider, returnTo)
      // 성공하면 위에서 페이지를 떠나므로 이 아래는 실행되지 않는다.
    } catch (reason) {
      // 공급자 키가 서버에 설정되지 않은 경우 등이다. 서버가 한국어 안내를 내려 준다.
      setError(
        reason instanceof ApiError
          ? reason.message
          : `${SOCIAL_PROVIDER_LABELS[provider]} 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.`,
      )
      setPending(undefined)
    }
  }

  return (
    <div className="grid gap-2.5">
      {error ? (
        <AlertBanner title="소셜 로그인을 시작하지 못했습니다" variant="error">
          {error}
        </AlertBanner>
      ) : null}

      {SOCIAL_PROVIDERS.map((provider) => (
        <button
          className={`mj-font-emphasis flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-[10px] border text-base transition-opacity disabled:cursor-not-allowed disabled:opacity-60 ${providerStyles[provider]}`}
          disabled={Boolean(pending)}
          key={provider}
          onClick={() => void handleStart(provider)}
          type="button"
        >
          {/* 로고 크기를 고정해 글자 길이가 달라도 세 버튼의 로고가 같은 위치에 놓인다. */}
          <span className="flex size-[18px] flex-none items-center justify-center">
            <SocialProviderLogo provider={provider} />
          </span>
          {pending === provider
            ? `${SOCIAL_PROVIDER_LABELS[provider]}로 이동 중`
            : labelPrefix.replace('{provider}', SOCIAL_PROVIDER_LABELS[provider])}
        </button>
      ))}
    </div>
  )
}
