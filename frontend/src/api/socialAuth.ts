import { apiRequest } from './client'
import { unwrapEnvelope } from './envelope'
import { isLoginResponse, type LoginResponse } from './authSession'
import type { PreferredLanguage } from './auth'
import { translate } from '../i18n'

/**
 * 소셜 공급자 코드다.
 *
 * **경로에는 소문자, 응답 필드에는 대문자**가 쓰인다(백엔드 SocialProvider enum). 두 표기를
 * 섞으면 공급자 콘솔에 등록된 redirect_uri와 어긋나거나 응답 판별이 실패하므로 타입을 나눠 둔다.
 */
export const SOCIAL_PROVIDERS = ['google', 'kakao', 'naver'] as const

/** 경로 변수용 소문자 공급자다. */
export type SocialProviderPath = (typeof SOCIAL_PROVIDERS)[number]

/** 응답 필드용 대문자 공급자다. */
export type SocialProvider = 'GOOGLE' | 'KAKAO' | 'NAVER'

/** 화면에 표시할 공급자 이름이다. */
export const SOCIAL_PROVIDER_LABELS = (): Record<SocialProviderPath, string> => ({
  google: translate('socialAuth.t1'),
  kakao: translate('socialAuth.t2'),
  naver: translate('socialAuth.t3'),
})

/** 값이 지원 공급자인지 좁힌다. 주소로 직접 들어온 경로 변수를 검증하는 데 쓴다. */
export function isSocialProviderPath(value: unknown): value is SocialProviderPath {
  return typeof value === 'string' && SOCIAL_PROVIDERS.includes(value as SocialProviderPath)
}

/** 대문자 공급자 값을 경로용 소문자로 바꾼다. */
export function toProviderPath(provider: SocialProvider): SocialProviderPath {
  return provider.toLowerCase() as SocialProviderPath
}

/**
 * 소셜 로그인 결과 상태다.
 *
 * - `LOGIN`: 이미 연결된 계정이라 토큰까지 발급됐다.
 * - `SIGNUP_REQUIRED`: 신규 사용자라 추가정보 입력이 필요하다.
 * - `LINK_REQUIRED`: 같은 이메일의 기존 계정이 있어 비밀번호 확인이 필요하다.
 */
export type SocialLoginStatus = 'LOGIN' | 'SIGNUP_REQUIRED' | 'LINK_REQUIRED'

export type SocialAuthorizeUrlResponse = {
  provider: SocialProvider
  authorizeUrl: string
}

export type SocialLoginResult = {
  status: SocialLoginStatus
  /** 서버가 만든 안내 문구다. 사용자에게 그대로 보여 주도록 설계돼 있다. */
  message: string | null
  /** status가 LOGIN일 때만 채워지며 saveAuthSession에 그대로 넘길 수 있다. */
  login: LoginResponse | null
  /** 가입·연결 요청에 다시 넘길 임시 토큰이다. **5분 만료**다. */
  socialToken: string | null
  provider: SocialProvider
  /** 공급자가 준 이메일이며 SIGNUP_REQUIRED에서만 의미가 있다. */
  email: string | null
  /**
   * 공급자가 이메일을 주었는지 여부다.
   *
   * `SIGNUP_REQUIRED`에서만 의미가 있다. false면 추가정보 화면에 이메일 입력칸을 띄워야 한다.
   * `LINK_REQUIRED`에서는 무시한다.
   */
  emailProvided: boolean
  /** LINK_REQUIRED에서 어느 계정에 연결하는지 보여 줄 마스킹된 이메일이다. */
  maskedEmail: string | null
}

export type SocialSignupRequest = {
  socialToken: string
  nickname: string
  /** emailProvided가 false일 때만 필요하다. 그 외에는 보내지 않는다. */
  email?: string
  preferredLanguage: PreferredLanguage
  termsOfServiceAgreed: boolean
  privacyPolicyAgreed: boolean
}

export type SocialAccountResponse = {
  provider: SocialProvider
  providerName: string
  connectedAt: string
}

/**
 * 공급자 로그인 화면 주소를 서버에서 받는다.
 *
 * **URL을 프론트에서 조립하지 않는다.** client_id·redirect_uri·scope는 서버 설정에만 있고,
 * redirect_uri는 한 글자만 달라도 공급자가 요청을 거부한다.
 *
 * @param state CSRF 방어용 난수. 서버는 이 값을 URL에 실어 주기만 하고 검증은 프론트가 한다.
 */
export async function getSocialAuthorizeUrl(
  provider: SocialProviderPath,
  state: string,
  signal?: AbortSignal,
): Promise<SocialAuthorizeUrlResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/auth/social/${provider}/authorize-url?state=${encodeURIComponent(state)}`,
    { method: 'GET', signal },
  )

  return unwrapEnvelope<SocialAuthorizeUrlResponse>(response)
}

/**
 * 공급자가 돌려준 인가 코드로 로그인을 시도한다.
 *
 * **code는 1회용이고 수명이 짧다.** 콜백 화면에서 즉시 호출해야 하며, 새로고침으로 같은 코드를
 * 재사용하면 SOCIAL_AUTH_CODE_INVALID가 된다. 실패 시 재시도는 로그인 화면부터 다시 시작한다.
 */
export async function socialLogin(
  provider: SocialProviderPath,
  body: { code: string; state: string },
  signal?: AbortSignal,
): Promise<SocialLoginResult> {
  const response = await apiRequest<unknown>(`/api/v1/auth/social/${provider}/login`, {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  })

  return unwrapEnvelope<SocialLoginResult>(response)
}

/** 소셜 계정으로 신규 가입한다. role은 서버가 FAN으로 고정하므로 보내지 않는다. */
export async function socialSignup(
  request: SocialSignupRequest,
  signal?: AbortSignal,
): Promise<LoginResponse> {
  const response = await apiRequest<unknown>('/api/v1/auth/social/signup', {
    method: 'POST',
    body: JSON.stringify(request),
    signal,
  })

  const data = unwrapEnvelope<unknown>(response)
  if (!isLoginResponse(data)) {
    throw new TypeError(translate('socialAuth.t4'))
  }

  return data
}

/** 비밀번호를 확인해 기존 계정에 소셜 계정을 연결하고 동시에 로그인한다. */
export async function socialLink(
  request: { socialToken: string; password: string },
  signal?: AbortSignal,
): Promise<LoginResponse> {
  const response = await apiRequest<unknown>('/api/v1/auth/social/link', {
    method: 'POST',
    body: JSON.stringify(request),
    signal,
  })

  const data = unwrapEnvelope<unknown>(response)
  if (!isLoginResponse(data)) {
    throw new TypeError(translate('socialAuth.t5'))
  }

  return data
}

/** 마이페이지에서 볼 내 소셜 연결 목록을 조회한다. */
export async function getMySocialAccounts(
  authToken: string,
  signal?: AbortSignal,
): Promise<SocialAccountResponse[]> {
  const response = await apiRequest<unknown>('/api/v1/users/me/social-accounts', {
    method: 'GET',
    authToken,
    signal,
  })

  const data = unwrapEnvelope<unknown>(response)
  return Array.isArray(data) ? (data as SocialAccountResponse[]) : []
}

/** 로그인한 상태에서 소셜 계정을 추가로 연결한다. 인가 코드는 로그인과 같은 방식으로 받는다. */
export async function connectMySocialAccount(
  provider: SocialProviderPath,
  body: { code: string; state: string },
  authToken: string,
  signal?: AbortSignal,
): Promise<SocialAccountResponse> {
  const response = await apiRequest<unknown>(`/api/v1/users/me/social-accounts/${provider}`, {
    method: 'POST',
    authToken,
    body: JSON.stringify(body),
    signal,
  })

  return unwrapEnvelope<SocialAccountResponse>(response)
}

/** 소셜 연결을 해제한다. 마지막 로그인 수단이면 서버가 409로 막는다. */
export async function disconnectMySocialAccount(
  provider: SocialProviderPath,
  authToken: string,
  signal?: AbortSignal,
): Promise<void> {
  await apiRequest<void>(`/api/v1/users/me/social-accounts/${provider}`, {
    method: 'DELETE',
    authToken,
    signal,
  })
}
