import { apiRequest } from './client'

export type SignupRole = 'FAN' | 'INFLUENCER' | 'MANAGER'
export type PreferredLanguage = 'ko' | 'en'

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
  userId: string | number
  role: string
  createdAt: string
}

export type LoginRole = SignupRole | 'SOLO_INFLUENCER'

export type LoginRequest = {
  loginId: string
  password: string
}

export type LoginResponse = {
  accessToken: string
  refreshToken: string
  expiresIn: number
  userId: string | number
  role: LoginRole
  nickname: string
}

const AUTH_SESSION_KEY = 'melly-auth-session'

function isLoginRole(value: unknown): value is LoginRole {
  return (
    value === 'FAN' ||
    value === 'INFLUENCER' ||
    value === 'MANAGER' ||
    value === 'SOLO_INFLUENCER'
  )
}

function isSignupResponse(value: unknown): value is SignupResponse {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const response = value as Record<string, unknown>

  return (
    (typeof response.userId === 'string' || typeof response.userId === 'number') &&
    typeof response.role === 'string' &&
    response.role.trim().length > 0 &&
    typeof response.createdAt === 'string' &&
    response.createdAt.trim().length > 0
  )
}

function isLoginResponse(value: unknown): value is LoginResponse {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const response = value as Record<string, unknown>

  return (
    typeof response.accessToken === 'string' &&
    response.accessToken.trim().length > 0 &&
    typeof response.refreshToken === 'string' &&
    response.refreshToken.trim().length > 0 &&
    typeof response.expiresIn === 'number' &&
    Number.isFinite(response.expiresIn) &&
    response.expiresIn > 0 &&
    (typeof response.userId === 'string' || typeof response.userId === 'number') &&
    isLoginRole(response.role) &&
    typeof response.nickname === 'string'
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
    throw new TypeError('로그인 응답 형식이 올바르지 않습니다.')
  }

  return data
}

export function saveAuthSession(response: LoginResponse, remember: boolean) {
  const selectedStorage = remember ? window.localStorage : window.sessionStorage
  const unusedStorage = remember ? window.sessionStorage : window.localStorage

  unusedStorage.removeItem(AUTH_SESSION_KEY)
  selectedStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(response))
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
    throw new TypeError('회원가입 응답 형식이 올바르지 않습니다.')
  }

  return data
}
