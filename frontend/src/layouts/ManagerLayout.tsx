import { RoleLayout } from './RoleLayout'
import type { RoleNavigationItem } from './RoleLayout'

const managerNavigation: readonly RoleNavigationItem[] = [
  { label: '팬미팅 관리', to: '/manager/fan-meetings' },
  { label: '홍보 및 응모 관리', to: '/manager/events' },
  { label: '마이페이지', to: '/manager/mypage' },
]

export function ManagerLayout() {
  return (
    <RoleLayout
      description="이벤트와 팬미팅 운영 화면"
      navigation={managerNavigation}
      title="매니저"
    />
  )
}
