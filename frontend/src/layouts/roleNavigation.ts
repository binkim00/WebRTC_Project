import type { LoginRole } from '../api/auth'

export type RoleNavigationItem = {
  label: string
  to: string
}

const fanNavigation: readonly RoleNavigationItem[] = [
  { label: '이벤트', to: '/fan/events' },
  { label: '프로필', to: '/fan/mypage/profile' },
  { label: '응모한 이벤트', to: '/fan/mypage/applications' },
  {
    label: '예정 팬미팅',
    to: '/fan/mypage/fan-meetings?status=upcoming',
  },
]

const influencerNavigation: readonly RoleNavigationItem[] = [
  { label: '나의 팬미팅', to: '/influencer/fan-meetings' },
  { label: '내 프로필', to: '/influencer/mypage/profile' },
  { label: '팬미팅 이력', to: '/influencer/mypage/fan-meetings' },
]

const soloInfluencerNavigation: readonly RoleNavigationItem[] = [
  { label: '팬미팅 관리', to: '/manager/fan-meetings' },
  { label: '홍보 및 응모 관리', to: '/manager/events' },
  { label: '내 프로필', to: '/influencer/mypage/profile' },
  { label: '팬미팅 이력', to: '/influencer/mypage/fan-meetings' },
]

const managerNavigation: readonly RoleNavigationItem[] = [
  { label: '팬미팅 관리', to: '/manager/fan-meetings' },
  { label: '홍보 및 응모 관리', to: '/manager/events' },
  { label: '마이페이지', to: '/manager/mypage' },
]

export function getRoleNavigation(role: LoginRole): readonly RoleNavigationItem[] {
  switch (role) {
    case 'FAN':
      return fanNavigation
    case 'INFLUENCER':
      return influencerNavigation
    case 'SOLO_INFLUENCER':
      return soloInfluencerNavigation
    case 'MANAGER':
      return managerNavigation
  }
}
