import type { LoginRole } from '../../api/authSession'
import { useTranslation } from '../../i18n'
import { getAppHeaderNavigation } from './appHeaderNavigation'
import { LanguageSelect } from './LanguageSelect'
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
 *
 * 역할별 메뉴는 사전 키로 정의되어 있고(appHeaderNavigation) 여기서 현재 언어로 번역한다.
 * 언어 선택기는 모든 화면에서 같은 자리에 있어야 하므로 이 헤더가 항상 붙인다.
 */
export function AppHeader({ role, items, hideNotifications, actions, ...props }: AppHeaderProps) {
  const { t } = useTranslation()

  // 역할 메뉴는 키를 번역해 넘기고, 직접 전달된 items는 이미 완성된 라벨이라 그대로 쓴다.
  const navigationItems: readonly NavigationItem[] = role
    ? getAppHeaderNavigation(role).map((item) => ({
        label: t(item.labelKey),
        to: item.to,
        end: item.end,
      }))
    : (items ?? [])

  const visibleItems = hideNotifications
    ? navigationItems.filter((item) => item.to !== '/notifications')
    : navigationItems

  return (
    <TopNavigation
      actions={
        <>
          <LanguageSelect />
          {actions}
        </>
      }
      brand="MELLY"
      items={visibleItems}
      {...props}
    />
  )
}
