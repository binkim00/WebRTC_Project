// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LoginRole } from '../../api/authSession'
import { I18nProvider } from '../../i18n'
import { AppHeader } from './AppHeader'
import { getAppHeaderNavigation } from './appHeaderNavigation'

afterEach(cleanup)

// 렌더링되는 라벨은 화면 언어에 따라 달라진다. 이 테스트는 한국어 라벨을 검증하므로
// I18nProvider가 읽는 저장값을 ko로 고정해 브라우저 기본 언어에 흔들리지 않게 한다.
beforeEach(() => {
  window.localStorage.setItem('melly-locale', 'ko')
})

/**
 * 역할별로 기대하는 네비게이션 계약이다.
 *
 * 라벨은 사전 키로 정의되어 있으므로(언어 전환 대응) 키와 함께 한국어 표시 문구를 적어 둔다.
 * 키가 바뀌면 계약 비교에서, 문구가 바뀌면 렌더링 비교에서 잡힌다.
 */
// 서비스 전체 공지는 역할과 무관한 공용 안내라 모든 역할 메뉴에 들어간다.
const serviceNoticesItem = {
  labelKey: 'app.nav.serviceNotices',
  label: '공지사항',
  to: '/service-notices',
} as const

const expectedNavigation = {
  FAN: [
    { labelKey: 'nav.fan.events', label: '이벤트', to: '/fan/events' },
    { labelKey: 'nav.fan.influencers', label: '인플루언서', to: '/fan/influencers' },
    serviceNoticesItem,
    { labelKey: 'nav.fan.mypage', label: '마이페이지', to: '/fan/mypage/profile' },
    { labelKey: 'nav.notifications', label: '알림', to: '/notifications' },
  ],
  INFLUENCER: [
    { labelKey: 'nav.influencer.meetings', label: '내 팬미팅', to: '/influencer/fan-meetings' },
    { labelKey: 'nav.influencer.fans', label: '내 팬', to: '/influencer/fans' },
    serviceNoticesItem,
    {
      labelKey: 'nav.influencer.mypage',
      label: '마이페이지',
      to: '/influencer/mypage/profile',
    },
    { labelKey: 'nav.notifications', label: '알림', to: '/notifications' },
  ],
  SOLO_INFLUENCER: [
    { labelKey: 'nav.influencer.meetings', label: '내 팬미팅', to: '/influencer/fan-meetings' },
    { labelKey: 'nav.influencer.fans', label: '내 팬', to: '/influencer/fans' },
    serviceNoticesItem,
    {
      labelKey: 'nav.influencer.mypage',
      label: '마이페이지',
      to: '/influencer/mypage/profile',
    },
    { labelKey: 'nav.notifications', label: '알림', to: '/notifications' },
  ],
  MANAGER: [
    { labelKey: 'nav.manager.meetings', label: '팬미팅 관리', to: '/manager/fan-meetings' },
    { labelKey: 'nav.manager.organization', label: '조직 관리', to: '/manager/organization' },
    serviceNoticesItem,
    { labelKey: 'nav.manager.mypage', label: '마이페이지', to: '/manager/mypage' },
  ],
  // 서비스 운영자는 팬미팅 운영 화면이 없고 서비스 단위 업무만 갖는다.
  // 공지사항(공개 화면)은 게시된 모습 확인용으로 함께 둔다.
  ADMIN: [
    {
      labelKey: 'nav.admin.serviceNotices',
      label: '전체 공지 관리',
      to: '/admin/service-notices',
    },
    serviceNoticesItem,
  ],
} as const satisfies Record<
  LoginRole,
  readonly { labelKey: string; label: string; to: string }[]
>

describe('AppHeader', () => {
  it.each(Object.keys(expectedNavigation) as LoginRole[])(
    '%s 역할의 최종 네비게이션 계약만 렌더링한다',
    (role) => {
      const items = expectedNavigation[role]
      const { container } = render(
        <I18nProvider>
          <MemoryRouter initialEntries={[items[0].to]}>
            <AppHeader role={role} />
          </MemoryRouter>
        </I18nProvider>,
      )

      // 항목 구성은 사전 키 기준으로 비교한다.
      expect(getAppHeaderNavigation(role)).toEqual(
        items.map((item) => ({ labelKey: item.labelKey, to: item.to })),
      )

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

  it('언어 선택기를 항상 함께 제공한다', () => {
    // 언어 전환 진입점이 특정 화면에만 있으면 사용자가 찾지 못한다. 헤더가 항상 붙인다.
    const { container } = render(
      <I18nProvider>
        <MemoryRouter>
          <AppHeader role="FAN" />
        </MemoryRouter>
      </I18nProvider>,
    )

    const select = container.querySelector('header select')
    expect(select).not.toBeNull()
    expect((select as HTMLSelectElement).value).toBe('ko')
  })
})
