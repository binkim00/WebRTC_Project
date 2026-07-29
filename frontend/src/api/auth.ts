import { apiRequest } from './client'
import {
  clearAuthSession,
  getAuthSession,
  isLoginResponse,
  type LoginResponse,
} from './authSession'

export {
  AUTH_EXPIRED_EVENT,
  clearAuthSession,
  getAuthSession,
  saveAuthSession,
  type LoginResponse,
  type LoginRole,
} from './authSession'

export type SignupRole = 'FAN' | 'INFLUENCER' | 'MANAGER'
export type PreferredLanguage = 'KOREAN' | 'ENGLISH'

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
  role: string
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
    typeof response.role === 'string' &&
    response.role.trim().length > 0 &&
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
    throw new TypeError('로그인 응답 형식이 올바르지 않습니다.')
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
    throw new TypeError('회원가입 응답 형식이 올바르지 않습니다.')
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
