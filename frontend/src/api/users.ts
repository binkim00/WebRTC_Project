import { isLoginRole, type LoginRole } from './authSession'
import { apiRequest } from './client'
import { translate } from '../i18n'

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
  /**
   * 이메일 인증 완료 여부다.
   *
   * 이메일 인증 기능이 아직 배포되지 않은 백엔드(lab 리버트 상태)는 이 필드를 내려주지
   * 않으므로 선택 필드로 두고, undefined면 화면에서 인증 안내를 켜지 않는다.
   */
  emailVerified?: boolean
}

export type UpdateUserProfileRequest = {
  nickname: string
  preferredLanguage: string
}

/** 탈퇴 처리 결과다. withdrawnAt은 백엔드가 기록한 탈퇴 시각이다. */
export type WithdrawResult = {
  withdrawnAt: string
  success: boolean
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
    typeof value.preferredLanguage === 'string' &&
    // 구버전 백엔드는 필드 자체가 없으므로 undefined도 허용한다.
    (value.emailVerified === undefined || typeof value.emailVerified === 'boolean')
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
    throw new TypeError(translate('users.t1'))
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
    throw new TypeError(translate('users.t2'))
  }

  return response.data
}

/**
 * 비밀번호 변경 결과다.
 *
 * reloginRequired는 항상 true다. 백엔드가 변경과 동시에 모든 기기의 로그인 세션을 끊으므로
 * 호출한 화면은 반드시 세션을 정리하고 로그인 화면으로 안내해야 한다.
 */
export type PasswordChangeResult = {
  changedAt: string
  reloginRequired: boolean
}

/**
 * 로그인한 사용자의 비밀번호를 바꾼다. 본인 확인을 위해 현재 비밀번호가 필요하다.
 *
 * 현재 비밀번호가 다르면 400(USER_PASSWORD_MISMATCH), 새 비밀번호가 규칙을 만족하지 않으면
 * 400(PASSWORD_POLICY_VIOLATION), 소셜 로그인만 쓰는 계정이면 409(PASSWORD_CHANGE_NOT_AVAILABLE)다.
 */
export async function changeMyPassword(
  currentPassword: string,
  newPassword: string,
  authToken: string,
  signal?: AbortSignal,
): Promise<PasswordChangeResult> {
  const response = await apiRequest<ApiEnvelope<unknown>>('/api/v1/users/me/password', {
    method: 'PATCH',
    authToken,
    signal,
    body: JSON.stringify({ currentPassword, newPassword }),
  })

  if (!response.success || !isRecord(response.data)) {
    throw new TypeError(translate('accountSecurity.invalidResponse'))
  }

  return {
    changedAt: typeof response.data.changedAt === 'string' ? response.data.changedAt : '',
    reloginRequired: response.data.reloginRequired !== false,
  }
}

/**
 * 회원을 탈퇴 처리한다. 본인 확인을 위해 현재 비밀번호가 필요하다.
 *
 * 백엔드가 Authorization 헤더의 토큰까지 무효화하므로 성공 뒤에는 세션을 반드시 정리해야 한다.
 */
export async function withdrawMyAccount(
  password: string,
  authToken: string,
  signal?: AbortSignal,
): Promise<WithdrawResult> {
  const response = await apiRequest<ApiEnvelope<unknown>>('/api/v1/users/me', {
    method: 'DELETE',
    authToken,
    signal,
    body: JSON.stringify({ password }),
  })

  if (!response.success || !isRecord(response.data)) {
    throw new TypeError(translate('users.t3'))
  }

  return {
    withdrawnAt: typeof response.data.withdrawnAt === 'string' ? response.data.withdrawnAt : '',
    success: response.data.success === true,
  }
}
