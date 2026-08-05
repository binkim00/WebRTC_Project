// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import type { LoginRole } from '../../api/authSession'
import { AppHeader } from './AppHeader'
import { getAppHeaderNavigation } from './appHeaderNavigation'

afterEach(cleanup)

const expectedNavigation = {
  FAN: [
    { label: '이벤트', to: '/fan/events' },
    { label: '마이페이지', to: '/fan/mypage/profile' },
    { label: '알림', to: '/notifications' },
  ],
  INFLUENCER: [
    { label: '내 팬미팅', to: '/influencer/fan-meetings' },
    { label: '내 팬', to: '/influencer/fans' },
    { label: '마이페이지', to: '/influencer/mypage/profile' },
    { label: '알림', to: '/notifications' },
  ],
  SOLO_INFLUENCER: [
    { label: '내 팬미팅', to: '/influencer/fan-meetings' },
    { label: '내 팬', to: '/influencer/fans' },
    { label: '마이페이지', to: '/influencer/mypage/profile' },
    { label: '알림', to: '/notifications' },
  ],
  MANAGER: [
    { label: '팬미팅 관리', to: '/manager/fan-meetings' },
    { label: '조직 관리', to: '/manager/organization' },
    { label: '마이페이지', to: '/manager/mypage' },
  ],
} as const satisfies Record<LoginRole, readonly { label: string; to: string }[]>

describe('AppHeader', () => {
  it.each(Object.keys(expectedNavigation) as LoginRole[])(
    '%s 역할의 최종 네비게이션 계약만 렌더링한다',
    (role) => {
      const items = expectedNavigation[role]
      const { container } = render(
        <MemoryRouter initialEntries={[items[0].to]}>
          <AppHeader role={role} />
        </MemoryRouter>,
      )

      expect(getAppHeaderNavigation(role)).toEqual(items)

      const headerText = container.querySelector('header')?.textContent ?? ''
      for (const item of items) {
        expect(headerText).toContain(item.label)
      }

      const currentLinks = Array.from(
        container.querySelectorAll<HTMLAnchorElement>('a[aria-current="page"]'),
      )
      expect(currentLinks.length).toBeGreaterThan(0)
      expect(currentLinks.every((link) => link.textContent === items[0].label)).toBe(true)
    },
  )

  it('인플루언서와 1인 인플루언서가 같은 네비게이션 배열을 공유한다', () => {
    expect(getAppHeaderNavigation('SOLO_INFLUENCER')).toBe(
      getAppHeaderNavigation('INFLUENCER'),
    )
  })
})
