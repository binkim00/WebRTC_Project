import { ApiError } from './ApiError'
import { apiRequest } from './client'
import { translate } from '../i18n'

/**
 * 조직 정보다.
 *
 * 이름 말고는 모두 비어 있을 수 있다. 엔티티의 `business_number`·`representative_name`·
 * `contact_email`·`contact_phone` 컬럼에 NOT NULL이 없고, 서비스가 공백 입력을 null로 눕혀
 * 저장하기 때문이다. 이 필드들을 문자열로만 받으면 값이 빈 조직에서 타입 가드가 실패해
 * 조직 화면 전체가 오류로 바뀐다.
 */
export type Organization = {
  organizationId: number
  name: string
  businessNumber: string | null
  representativeName: string | null
  contactEmail: string | null
  contactPhone: string | null
  logoUrl: string | null
  description: string | null
  status: string
  createdAt: string
}

export type OrganizationMember = {
  organizationMemberId: number
  userId: number
  nickname: string
  profileImageUrl: string | null
  userRole: string
  memberType: string
  status: string
  joinedAt: string
  leftAt: string | null
}

export type MyOrganizationMembers = { organization: Organization; members: OrganizationMember[] }

export type OrganizationInvitationAcceptResponse = {
  organization: Organization
  member: OrganizationMember
}

export type OrganizationCreateRequest = {
  name: string
  businessNumber: string
  representativeName: string
  contactEmail: string
  contactPhone: string
  logoUrl?: string
  description?: string
}

export type OrganizationInvitation = {
  organizationId: number
  influencerId: number
  token: string
  expiresAt: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === 'string' || value === null
}

function isOrganization(value: unknown): value is Organization {
  if (!isRecord(value)) return false
  return typeof value.organizationId === 'number' && typeof value.name === 'string' &&
    isNullableString(value.businessNumber) && isNullableString(value.representativeName) &&
    isNullableString(value.contactEmail) && isNullableString(value.contactPhone) &&
    isNullableString(value.logoUrl) && isNullableString(value.description) &&
    typeof value.status === 'string' && typeof value.createdAt === 'string'
}

function isOrganizationMember(value: unknown): value is OrganizationMember {
  if (!isRecord(value)) return false
  return typeof value.organizationMemberId === 'number' && typeof value.userId === 'number' &&
    typeof value.nickname === 'string' && isNullableString(value.profileImageUrl) &&
    typeof value.userRole === 'string' && typeof value.memberType === 'string' &&
    typeof value.status === 'string' && typeof value.joinedAt === 'string' && isNullableString(value.leftAt)
}

function unwrap<T>(value: unknown, guard: (candidate: unknown) => candidate is T): T {
  const envelope = isRecord(value) && value.success === true ? value.data : value
  if (!guard(envelope)) throw new TypeError(translate('organizations.t1'))
  return envelope
}

function isOrganizationPayload(value: unknown): value is MyOrganizationMembers {
  return isRecord(value) && isOrganization(value.organization) && Array.isArray(value.members) && value.members.every(isOrganizationMember)
}

function isInvitationAcceptPayload(value: unknown): value is OrganizationInvitationAcceptResponse {
  return isRecord(value) && isOrganization(value.organization) && isOrganizationMember(value.member)
}

/** 활성 조직과 구성원을 조회합니다. 활성 소속이 없으면 명세상 400이므로 null을 반환합니다. */
export async function getMyOrganization(authToken: string, signal?: AbortSignal): Promise<MyOrganizationMembers | null> {
  try {
    const response = await apiRequest<unknown>('/api/v1/organizations/me/members', { method: 'GET', authToken, signal })
    return unwrap(response, isOrganizationPayload)
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) return null
    throw error
  }
}

/** 매니저의 조직을 생성합니다. 생성자는 자동으로 활성 구성원이 됩니다. */
export async function createOrganization(request: OrganizationCreateRequest, authToken: string, signal?: AbortSignal): Promise<Organization> {
  const response = await apiRequest<unknown>('/api/v1/organizations', { method: 'POST', authToken, signal, body: JSON.stringify(request) })
  return unwrap(response, isOrganization)
}

/**
 * 가입된 인플루언서를 초대 수락 절차 없이 조직 구성원으로 바로 연결합니다. (ADMIN 전용)
 *
 * 백엔드가 `hasRole("ADMIN")`으로 막고 서비스 계층에서도 다시 검증하므로,
 * 매니저 화면에서 호출하면 항상 403입니다. 매니저는 createOrganizationInvitation을 쓰세요.
 * 인플루언서 동의를 건너뛰는 경로라 관리자 도구가 생기기 전까지는 호출부가 없습니다.
 *
 * 이미 다른 활성 조직에 소속된 사용자는 백엔드가 400으로 거절합니다.
 */
export async function addOrganizationMember(organizationId: number, userId: number, authToken: string, signal?: AbortSignal): Promise<OrganizationMember> {
  const response = await apiRequest<unknown>(`/api/v1/organizations/${organizationId}/members`, { method: 'POST', authToken, signal, body: JSON.stringify({ userId }) })
  return unwrap(response, isOrganizationMember)
}

/** 매니저가 인플루언서에게 전달할 일회성 초대 토큰을 발급합니다. */
export async function createOrganizationInvitation(organizationId: number, influencerId: number, authToken: string, signal?: AbortSignal): Promise<OrganizationInvitation> {
  const response = await apiRequest<unknown>(`/api/v1/organizations/${organizationId}/invitations`, { method: 'POST', authToken, signal, body: JSON.stringify({ influencerId }) })
  return unwrap(response, (value): value is OrganizationInvitation => {
    if (!isRecord(value)) return false
    return typeof value.organizationId === 'number' && typeof value.influencerId === 'number' && typeof value.token === 'string' && typeof value.expiresAt === 'string'
  })
}

/** 로그인한 인플루언서가 자신에게 발급된 일회성 초대를 수락합니다. */
export async function acceptOrganizationInvitation(token: string, authToken: string, signal?: AbortSignal): Promise<OrganizationInvitationAcceptResponse> {
  const response = await apiRequest<unknown>(`/api/v1/organization-invitations/${encodeURIComponent(token)}/accept`, { method: 'POST', authToken, signal })
  return unwrap(response, isInvitationAcceptPayload)
}

/** 구성원을 물리 삭제하지 않고 INACTIVE 상태로 전환합니다. */
export async function removeOrganizationMember(organizationId: number, userId: number, authToken: string, signal?: AbortSignal): Promise<void> {
  await apiRequest(`/api/v1/organizations/${organizationId}/members/${userId}`, { method: 'DELETE', authToken, signal })
}
