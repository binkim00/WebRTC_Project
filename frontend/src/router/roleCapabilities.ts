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
  /** 서비스 전체 공지 작성·수정·삭제. 백엔드에서 ADMIN 전용이다. */
  | 'MANAGE_SERVICE_NOTICES'

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
  /**
   * 서비스 운영자다. 팬미팅을 직접 만들거나 진행하지 않으므로 MANAGE_FAN_MEETINGS는 주지 않는다.
   *
   * 백엔드가 ADMIN에게 허용하는 범위(SecurityConfig)를 그대로 옮긴 것이다.
   * - 서비스 전체 공지 작성·수정·삭제 (POST/PATCH/DELETE /service-notices)
   * - 팬미팅 대기열·참가자·통계 조회, 유해발언 검토 (읽기·검토 권한)
   * 조직 구성원 추가(POST /organizations/*&#47;members)도 ADMIN 전용이지만, 그 화면은
   * 매니저 조직 관리 안에 있어 별도 권한으로 열지 않는다. 필요해지면 그때 분리한다.
   */
  ADMIN: new Set(['MANAGE_SERVICE_NOTICES', 'VIEW_MEETING_OPERATIONS']),
}

/**
 * 로그인 직후 보낼 첫 화면이다.
 *
 * **모든 역할을 메인 화면으로 보낸다.** 역할별 작업 화면으로 곧장 보내면 로그인 직후 맥락 없이
 * 목록 한가운데 놓이게 되고, 메인의 팬미팅 소식·안내를 건너뛴다. 각자 할 일은 메인에서
 * 헤더 네비게이션으로 이어 간다.
 *
 * 로그인·소셜 로그인이 같은 값을 쓰도록 한곳에 모아 둔다(두 화면에 같은 분기를 복사해 두면
 * 한쪽만 고쳐지기 쉽다). 역할별 경로가 다시 필요해지면 이 함수만 바꾸면 된다.
 */
export function landingPathForRole(_role: LoginRole): string {
  return '/'
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

  // 서비스 운영자 전용 영역이다. 알 수 없는 하위 경로도 같은 권한으로 묶어 실수로 열리지 않게 한다.
  if (/^\/admin(?:\/|$)/.test(pathname)) return 'MANAGE_SERVICE_NOTICES'

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
