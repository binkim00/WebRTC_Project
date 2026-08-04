import type { LoginRole } from '../../api/authSession'
import { getAppHeaderNavigation } from './appHeaderNavigation'
import {
  TopNavigation,
  type NavigationItem,
  type TopNavigationProps,
} from './TopNavigation'

type AppHeaderBaseProps = Omit<TopNavigationProps, 'brand' | 'items'> & {
  /** 통화 화면은 진행 중 이탈을 막기 위해 알림 진입점을 의도적으로 숨긴다. */
  hideNotifications?: boolean
}

export type AppHeaderProps = AppHeaderBaseProps &
  (
    | {
        role: LoginRole
        items?: never
      }
    | {
        role?: undefined
        items?: readonly NavigationItem[]
      }
  )

/**
 * 제품 전역 헤더다. 인증 화면은 role만 전달하며 메뉴 배열을 직접 소유하지 않는다.
 * 비로그인·집중 화면은 같은 외형과 접근성 계약을 유지하되 명시적인 공용 items를 쓸 수 있다.
 */
export function AppHeader({ role, items, hideNotifications, ...props }: AppHeaderProps) {
  const navigationItems = role ? getAppHeaderNavigation(role) : (items ?? [])
  const visibleItems = hideNotifications
    ? navigationItems.filter((item) => item.to !== '/notifications')
    : navigationItems

  return <TopNavigation brand="MELLY" items={visibleItems} {...props} />
}
