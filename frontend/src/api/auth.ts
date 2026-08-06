import { apiRequest } from './client'
import {
  clearAuthSession,
  getAuthSession,
  isLoginResponse,
  type LoginResponse,
} from './authSession'
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
