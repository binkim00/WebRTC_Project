import { RoleLayout } from './RoleLayout'
import type { RoleNavigationItem } from './RoleLayout'

const influencerNavigation: readonly RoleNavigationItem[] = [
  { label: '내 프로필', to: '/influencer/mypage/profile' },
  { label: '팬미팅 이력', to: '/influencer/mypage/fan-meetings' },
]

export function InfluencerLayout() {
  return (
    <RoleLayout
      description="팬미팅 준비와 영상 통화 화면"
      navigation={influencerNavigation}
      title="인플루언서"
    />
  )
}
