import { isLoginRole, type LoginRole } from './authSession'
import { apiRequest } from './client'

type ApiEnvelope<T> = {
  success: boolean
  data: T
}

export type UserProfile = {
  userId: number
  loginId: string
  email: string
  nickname: string
  profileImageUrl: string | null
  role: LoginRole
  preferredLanguage: string
}

export type UpdateUserProfileRequest = {
  nickname: string
  preferredLanguage: string
}

export type UpdatedUserProfile = {
  userId: number
  email: string
  nickname: string
  profileImageUrl: string | null
  preferredLanguage: string
  updatedAt: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === 'string' || value === null
}

function isUserProfile(value: unknown): value is UserProfile {
  if (!isRecord(value)) return false

  return (
    typeof value.userId === 'number' &&
    typeof value.loginId === 'string' &&
    typeof value.email === 'string' &&
    typeof value.nickname === 'string' &&
    isNullableString(value.profileImageUrl) &&
    isLoginRole(value.role) &&
    typeof value.preferredLanguage === 'string'
  )
}

function isUpdatedUserProfile(value: unknown): value is UpdatedUserProfile {
  if (!isRecord(value)) return false

  return (
    typeof value.userId === 'number' &&
    typeof value.email === 'string' &&
    typeof value.nickname === 'string' &&
    isNullableString(value.profileImageUrl) &&
    typeof value.preferredLanguage === 'string' &&
    typeof value.updatedAt === 'string'
  )
}

export async function getMyProfile(
  authToken: string,
  signal?: AbortSignal,
): Promise<UserProfile> {
  const response = await apiRequest<ApiEnvelope<unknown>>('/api/v1/users/me', {
    method: 'GET',
    authToken,
    signal,
  })

  if (!response.success || !isUserProfile(response.data)) {
    throw new TypeError('회원정보 조회 응답 형식이 올바르지 않습니다.')
  }

  return response.data
}

export async function updateMyProfile(
  request: UpdateUserProfileRequest,
  authToken: string,
): Promise<UpdatedUserProfile> {
  const response = await apiRequest<ApiEnvelope<unknown>>('/api/v1/users/me', {
    method: 'PATCH',
    authToken,
    body: JSON.stringify(request),
  })

  if (!response.success || !isUpdatedUserProfile(response.data)) {
    throw new TypeError('회원정보 수정 응답 형식이 올바르지 않습니다.')
  }

  return response.data
}
