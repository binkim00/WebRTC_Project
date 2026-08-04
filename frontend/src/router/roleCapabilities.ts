import type { LoginRole } from '../api/auth'

/**
 * 화면 URL을 역할명이 아니라 실제 기능(capability) 단위로 보호하기 위한 권한 목록이다.
 *
 * 솔로 인플루언서는 인플루언서 업무와 팬미팅 운영을 모두 수행하지만,
 * 소속사 조직·매니저 계정 설정까지 사용할 수 있는 것은 아니므로 권한을 분리한다.
 */
export type RoleCapability =
  | 'USE_FAN_WORKSPACE'
  | 'USE_INFLUENCER_WORKSPACE'
  | 'MANAGE_FAN_MEETINGS'
  | 'MANAGE_ORGANIZATION'
  | 'USE_MANAGER_ACCOUNT'
  | 'VIEW_MEETING_OPERATIONS'

const capabilitiesByRole: Record<LoginRole, ReadonlySet<RoleCapability>> = {
  FAN: new Set(['USE_FAN_WORKSPACE']),
  INFLUENCER: new Set([
    'USE_INFLUENCER_WORKSPACE',
    'VIEW_MEETING_OPERATIONS',
  ]),
  SOLO_INFLUENCER: new Set([
    'USE_INFLUENCER_WORKSPACE',
    'MANAGE_FAN_MEETINGS',
    'VIEW_MEETING_OPERATIONS',
  ]),
  MANAGER: new Set([
    'MANAGE_FAN_MEETINGS',
    'MANAGE_ORGANIZATION',
    'USE_MANAGER_ACCOUNT',
    'VIEW_MEETING_OPERATIONS',
  ]),
}

/** 역할이 특정 제품 기능을 사용할 수 있는지 확인한다. */
export function hasRoleCapability(
  role: LoginRole,
  capability: RoleCapability,
): boolean {
  return capabilitiesByRole[role].has(capability)
}

/**
 * 보호가 필요한 URL을 가장 구체적인 기능 권한으로 변환한다.
 * 매니저 하위의 알 수 없는 새 경로는 매니저 계정 전용으로 간주해 솔로 계정에
 * 실수로 열리지 않게 한다.
 */
export function requiredCapabilityForPath(
  pathname: string,
): RoleCapability | undefined {
  if (/^\/fan(?:\/|$)/.test(pathname)) return 'USE_FAN_WORKSPACE'
  if (/^\/influencer(?:\/|$)/.test(pathname)) {
    return 'USE_INFLUENCER_WORKSPACE'
  }

  // 팬미팅 관리와 과거 이벤트 호환 경로만 솔로 인플루언서에게 허용한다.
  if (/^\/manager\/(?:fan-meetings|events)(?:\/|$)/.test(pathname)) {
    return 'MANAGE_FAN_MEETINGS'
  }
  if (/^\/manager\/organization(?:\/|$)/.test(pathname)) {
    return 'MANAGE_ORGANIZATION'
  }
  if (/^\/manager\/mypage(?:\/|$)/.test(pathname)) {
    return 'USE_MANAGER_ACCOUNT'
  }
  if (/^\/manager(?:\/|$)/.test(pathname)) return 'USE_MANAGER_ACCOUNT'

  if (/^\/fan-meetings\/[^/]+\/(?:fans|statistics)\/?$/.test(pathname)) {
    return 'VIEW_MEETING_OPERATIONS'
  }

  return undefined
}

/** 현재 역할이 URL에 연결된 기능을 사용할 수 있는지 확인한다. */
export function canRoleAccessPath(pathname: string, role: LoginRole): boolean {
  const requiredCapability = requiredCapabilityForPath(pathname)
  return requiredCapability
    ? hasRoleCapability(role, requiredCapability)
    : true
}
