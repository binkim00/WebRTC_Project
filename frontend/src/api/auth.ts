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
