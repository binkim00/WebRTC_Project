import type { LoginRole } from '../../api/authSession'
import type { NavigationItem } from './TopNavigation'

const fanNavigation = [
  { label: '이벤트', to: '/fan/events' },
  { label: '마이페이지', to: '/fan/mypage/profile' },
  { label: '알림', to: '/notifications' },
] as const satisfies readonly NavigationItem[]

const influencerNavigation = [
  { label: '내 팬미팅', to: '/influencer/fan-meetings' },
  { label: '내 팬', to: '/influencer/fans' },
  { label: '마이페이지', to: '/influencer/mypage/profile' },
  { label: '알림', to: '/notifications' },
] as const satisfies readonly NavigationItem[]

const managerNavigation = [
  { label: '팬미팅 관리', to: '/manager/fan-meetings' },
  { label: '조직 관리', to: '/manager/organization' },
  { label: '마이페이지', to: '/manager/mypage' },
] as const satisfies readonly NavigationItem[]

/** 역할별 전역 네비게이션의 단일 출처다. 화면에서는 별도 배열을 만들지 않는다. */
export const APP_HEADER_NAVIGATION: Readonly<
  Record<LoginRole, readonly NavigationItem[]>
> = {
  FAN: fanNavigation,
  INFLUENCER: influencerNavigation,
  SOLO_INFLUENCER: influencerNavigation,
  MANAGER: managerNavigation,
}

export function getAppHeaderNavigation(role: LoginRole): readonly NavigationItem[] {
  return APP_HEADER_NAVIGATION[role]
}
