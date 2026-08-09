import { apiRequest } from './client'
import {
  clearAuthSession,
  getAuthSession,
  isLoginResponse,
  type LoginResponse,
} from './authSession'
import { buildQuery, unwrapEnvelope } from './envelope'
import { translate } from '../i18n'

export {
  AUTH_EXPIRED_EVENT,
  clearAuthSession,
  getAuthSession,
  saveAuthSession,
  type LoginResponse,
  type LoginRole,
} from './authSession'

export type SignupRole =
  | 'FAN'
  | 'INFLUENCER'
  | 'MANAGER'
  | 'SOLO_INFLUENCER'
/**
 * 회원이 고른 선호 언어다. 백엔드 `PreferredLanguage` enum과 값·순서를 그대로 맞춘다.
 *
 * 이 값은 화면 표시 언어가 아니라 **영상통화 자막의 STT 인식 언어와 번역 방향**을 정한다.
 * 백엔드가 통화 시작 시 짧은 언어 코드(ko·en·ja·zh·vi)로 바꿔 LiveKit 토큰 attribute로 넘긴다.
 * 값을 늘릴 때는 백엔드 enum과 AI Agent의 지원 언어를 함께 확인해야 한다.
 */
export const PREFERRED_LANGUAGES = [
  'KOREAN',
  'ENGLISH',
  'JAPANESE',
  'CHINESE',
  'VIETNAMESE',
] as const

export type PreferredLanguage = (typeof PREFERRED_LANGUAGES)[number]

/**
 * 선택기에 보여 줄 언어 이름이다.
 *
 * 각 언어를 **그 언어로** 적는다(자기 이름, endonym). 화면을 읽지 못하는 언어로 바꿔 놓아도
 * 자기 언어를 찾을 수 있어야 하므로, 화면 표시 언어와 무관하게 이 문구를 그대로 쓴다.
 */
export const PREFERRED_LANGUAGE_LABELS: Record<PreferredLanguage, string> = {
  KOREAN: '한국어',
  ENGLISH: 'English',
  JAPANESE: '日本語',
  CHINESE: '中文',
  VIETNAMESE: 'Tiếng Việt',
}

/** 선택기에 그대로 넘길 수 있는 옵션 목록이다. */
export const PREFERRED_LANGUAGE_OPTIONS: readonly {
  label: string
  value: PreferredLanguage
}[] = PREFERRED_LANGUAGES.map((value) => ({
  label: PREFERRED_LANGUAGE_LABELS[value],
  value,
}))

/** 값이 지원 언어인지 좁힌다. 서버·저장값이 규격 밖이면 기본 언어로 되돌리는 데 쓴다. */
export function isPreferredLanguage(value: unknown): value is PreferredLanguage {
  return (
    typeof value === 'string' &&
    (PREFERRED_LANGUAGES as readonly string[]).includes(value)
  )
}

/**
 * 서버가 보낸 선호 언어 값을 화면에 쓸 이름으로 바꾼다.
 *
 * 프로필 응답의 타입은 `string`이라 사전을 바로 인덱싱할 수 없고, 백엔드에 새 언어가 먼저
 * 추가되면 프론트가 모르는 값이 올 수도 있다. 그럴 때는 받은 값을 그대로 보여 준다.
 */
export function preferredLanguageLabel(value: string | null | undefined): string {
  return isPreferredLanguage(value) ? PREFERRED_LANGUAGE_LABELS[value] : (value ?? '')
}

export function isSignupRole(value: unknown): value is SignupRole {
  return (
    value === 'FAN' ||
    value === 'INFLUENCER' ||
    value === 'MANAGER' ||
    value === 'SOLO_INFLUENCER'
  )
}

export type SignupRequest = {
  loginId: string
  password: string
  email: string
  nickname: string
  role: SignupRole
  preferredLanguage: PreferredLanguage
  termsOfServiceAgreed: boolean
  privacyPolicyAgreed: boolean
}

export type SignupResponse = {
  userId: number
  role: SignupRole
  createdAt: string
}

export type LoginRequest = {
  loginId: string
  password: string
}

function isSignupResponse(value: unknown): value is SignupResponse {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const response = value as Record<string, unknown>

  return (
    typeof response.userId === 'number' &&
    Number.isFinite(response.userId) &&
    isSignupRole(response.role) &&
    typeof response.createdAt === 'string' &&
    response.createdAt.trim().length > 0
  )
}

export async function login(
  request: LoginRequest,
  signal?: AbortSignal,
): Promise<LoginResponse> {
  const data = await apiRequest<unknown>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify(request),
    signal,
  })

  if (!isLoginResponse(data)) {
    throw new TypeError(translate('auth.t1'))
  }

  return data
}

export async function signup(
  request: SignupRequest,
  signal?: AbortSignal,
): Promise<SignupResponse> {
  const data = await apiRequest<unknown>('/api/v1/auth/signup', {
    method: 'POST',
    body: JSON.stringify(request),
    signal,
  })

  if (!isSignupResponse(data)) {
    throw new TypeError(translate('auth.t2'))
  }

  return data
}

/** 가입 전에 중복을 확인할 수 있는 항목이다. 백엔드 `AvailabilityTarget` enum과 값을 맞춘다. */
export type AvailabilityTarget = 'LOGIN_ID' | 'NICKNAME'

/** 중복 확인 결과다. value는 백엔드가 앞뒤 공백을 제거한 뒤 실제로 확인한 값이다. */
export type AvailabilityResult = {
  target: AvailabilityTarget
  value: string
  available: boolean
}

/**
 * 아이디·닉네임이 지금 가입에 쓸 수 있는 값인지 확인한다.
 *
 * 이메일은 확인 대상이 아니다(가입 여부를 그대로 알려 주는 통로가 되기 때문). 이메일 중복은
 * 가입 요청 시점에 409로 돌아온다.
 */
export async function checkAvailability(
  target: AvailabilityTarget,
  value: string,
  signal?: AbortSignal,
): Promise<AvailabilityResult> {
  const response = await apiRequest<unknown>(
    `/api/v1/auth/availability${buildQuery({ type: target, value })}`,
    { method: 'GET', signal },
  )

  const result = unwrapEnvelope<AvailabilityResult>(response)
  if (typeof result?.available !== 'boolean') {
    throw new TypeError(translate('accountSecurity.invalidResponse'))
  }

  return result
}

/**
 * 비밀번호 재설정 메일 발송 결과다.
 *
 * 가입되지 않은 이메일이어도 같은 형태로 응답한다. devToken은 개발 프로파일에서만 채워진다.
 */
export type PasswordResetSendResult = {
  email: string
  expiresAt: string
  resendAvailableAt: string
  devToken?: string | null
}

/** 비밀번호 재설정 완료 결과다. loginId는 방금 비밀번호를 바꾼 계정의 아이디다. */
export type PasswordResetConfirmResult = {
  loginId: string
  resetAt: string
}

/**
 * 입력한 이메일로 비밀번호 재설정 링크를 보내 달라고 요청한다.
 *
 * 가입 여부를 응답으로 알 수 없다. 요청이 잦으면 429(TOO_MANY_REQUESTS)로 거부된다.
 */
export async function requestPasswordReset(
  email: string,
  signal?: AbortSignal,
): Promise<PasswordResetSendResult> {
  const response = await apiRequest<unknown>('/api/v1/auth/password-reset', {
    method: 'POST',
    body: JSON.stringify({ email }),
    signal,
  })

  return unwrapEnvelope<PasswordResetSendResult>(response)
}

/**
 * 메일 링크의 토큰으로 새 비밀번호를 확정한다.
 *
 * 백엔드는 만료·사용 완료·위조된 토큰을 구분하지 않고 모두
 * 400(PASSWORD_RESET_TOKEN_INVALID) 하나로 응답한다.
 */
export async function confirmPasswordReset(
  token: string,
  newPassword: string,
  signal?: AbortSignal,
): Promise<PasswordResetConfirmResult> {
  const response = await apiRequest<unknown>('/api/v1/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
    signal,
  })

  return unwrapEnvelope<PasswordResetConfirmResult>(response)
}

export async function logout(signal?: AbortSignal): Promise<void> {
  const authToken = getAuthSession()?.accessToken

  if (!authToken) {
    clearAuthSession()
    return
  }

  try {
    await apiRequest<void>('/api/v1/auth/logout', {
      method: 'POST',
      authToken,
      signal,
    })
  } finally {
    clearAuthSession()
  }
}
