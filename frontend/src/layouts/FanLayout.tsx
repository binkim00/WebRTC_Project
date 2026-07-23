import { RoleLayout } from './RoleLayout'
import type { RoleNavigationItem } from './RoleLayout'

const fanNavigation: readonly RoleNavigationItem[] = [
  { label: '이벤트', to: '/fan/events' },
  { label: '프로필', to: '/fan/mypage/profile' },
  { label: '응모한 이벤트', to: '/fan/mypage/applications' },
  {
    label: '예정 팬미팅',
    to: '/fan/mypage/fan-meetings?status=upcoming',
  },
]

export function FanLayout() {
  return (
    <RoleLayout
      description="이벤트 응모와 팬미팅 참여 화면"
      navigation={fanNavigation}
      title="팬"
    />
  )
}
