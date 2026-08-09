import type { LoginRole } from '../../api/authSession'
import type { TranslationKey } from '../../i18n'

/**
 * 번역 전 네비게이션 항목이다.
 *
 * 라벨을 문자열이 아니라 **사전 키**로 들고 있는다. 이 모듈은 React 밖(상수)이라 훅을 쓸 수 없고,
 * 언어가 바뀔 때 상수를 다시 만들 수도 없다. 그래서 번역은 항목을 그리는 컴포넌트가 수행한다.
 */
export type AppHeaderNavigationItem = {
  labelKey: TranslationKey
  to: string
  end?: boolean
}

// 서비스 전체 공지는 역할과 무관한 공용 안내이므로 모든 역할 메뉴에 함께 둔다.
const serviceNoticesItem = {
  labelKey: 'app.nav.serviceNotices',
  to: '/service-notices',
} as const satisfies AppHeaderNavigationItem

const fanNavigation = [
  { labelKey: 'nav.fan.events', to: '/fan/events' },
  { labelKey: 'nav.fan.influencers', to: '/fan/influencers' },
  serviceNoticesItem,
  { labelKey: 'nav.fan.mypage', to: '/fan/mypage/profile' },
  { labelKey: 'nav.notifications', to: '/notifications' },
] as const satisfies readonly AppHeaderNavigationItem[]

/**
 * 소속사에 속한 인플루언서 메뉴다. 자기 조직과 담당 매니저를 확인하는 화면을 함께 둔다.
 *
 * 조직 가입은 백엔드가 `UserRole.INFLUENCER`에만 열어 두므로(초대 발급·수락 양쪽 모두)
 * 1인 인플루언서 메뉴에는 이 항목을 넣지 않는다. 화면 자체는 `/influencer/*` 권한으로 열려 있어
 * 주소로 직접 들어가면 소속사 없이 활동한다는 안내를 보게 된다.
 */
const influencerNavigation = [
  { labelKey: 'nav.influencer.meetings', to: '/influencer/fan-meetings' },
  { labelKey: 'nav.influencer.fans', to: '/influencer/fans' },
  { labelKey: 'nav.influencer.organization', to: '/influencer/organization' },
  serviceNoticesItem,
  { labelKey: 'nav.influencer.mypage', to: '/influencer/mypage/profile' },
  { labelKey: 'nav.notifications', to: '/notifications' },
] as const satisfies readonly AppHeaderNavigationItem[]

/** 1인 인플루언서 메뉴다. 소속 조직이 없는 계정이라 조직 항목만 빠진다. */
const soloInfluencerNavigation = influencerNavigation.filter(
  (item) => item.to !== '/influencer/organization',
)

const managerNavigation = [
  { labelKey: 'nav.manager.meetings', to: '/manager/fan-meetings' },
  { labelKey: 'nav.manager.organization', to: '/manager/organization' },
  serviceNoticesItem,
  { labelKey: 'nav.manager.mypage', to: '/manager/mypage' },
] as const satisfies readonly AppHeaderNavigationItem[]

/**
 * 서비스 운영자(ADMIN) 메뉴다.
 *
 * 팬미팅을 만들거나 진행하지 않으므로 운영 화면을 넣지 않고, 서비스 단위 업무인
 * 전체 공지 관리만 둔다. 알림은 팬미팅 진행 알림이라 운영자에게 의미가 없어 제외한다.
 * 공지사항(공개 화면)은 게시된 모습 그대로 확인하는 용도로 함께 둔다.
 */
const adminNavigation = [
  { labelKey: 'nav.admin.serviceNotices', to: '/admin/service-notices' },
  serviceNoticesItem,
] as const satisfies readonly AppHeaderNavigationItem[]

/** 역할별 전역 네비게이션의 단일 출처다. 화면에서는 별도 배열을 만들지 않는다. */
export const APP_HEADER_NAVIGATION: Readonly<
  Record<LoginRole, readonly AppHeaderNavigationItem[]>
> = {
  FAN: fanNavigation,
  INFLUENCER: influencerNavigation,
  SOLO_INFLUENCER: soloInfluencerNavigation,
  MANAGER: managerNavigation,
  ADMIN: adminNavigation,
}

export function getAppHeaderNavigation(role: LoginRole): readonly AppHeaderNavigationItem[] {
  return APP_HEADER_NAVIGATION[role]
}
