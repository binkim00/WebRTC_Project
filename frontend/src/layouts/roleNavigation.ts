import type { LoginRole } from '../api/auth'

export type RoleNavigationItem = {
  label: string
  to: string
}

// 모든 역할의 프로필(마이페이지)은 상단 우측의 프로필 요약(클릭 시 이동)으로 제공하므로 중앙 메뉴에서 제외한다.
const fanNavigation: readonly RoleNavigationItem[] = [
  { label: '이벤트', to: '/fan/events' },
  { label: '응모한 이벤트', to: '/fan/mypage/applications' },
  {
    label: '예정 팬미팅',
    to: '/fan/mypage/fan-meetings?status=upcoming',
  },
  { label: '알림', to: '/notifications' },
]

const influencerNavigation: readonly RoleNavigationItem[] = [
  { label: '나의 팬미팅', to: '/influencer/fan-meetings' },
  { label: '팬미팅 이력', to: '/influencer/mypage/fan-meetings' },
  { label: '알림', to: '/notifications' },
]

const soloInfluencerNavigation: readonly RoleNavigationItem[] = [
  { label: '팬미팅 관리', to: '/manager/fan-meetings' },
  { label: '홍보 및 응모 관리', to: '/manager/events' },
  { label: '팬미팅 이력', to: '/influencer/mypage/fan-meetings' },
  { label: '알림', to: '/notifications' },
]

const managerNavigation: readonly RoleNavigationItem[] = [
  { label: '팬미팅 관리', to: '/manager/fan-meetings' },
  { label: '홍보 및 응모 관리', to: '/manager/events' },
  { label: '조직 관리', to: '/manager/organization' },
  { label: '알림', to: '/notifications' },
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
