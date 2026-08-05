// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { I18nProvider } from '../../i18n'
import { TopNavigation } from './TopNavigation'

afterEach(cleanup)

// 헤더 기본 문구(건너뛰기 링크·네비 aria-label)는 화면 언어를 따른다. 한국어 문구로 요소를
// 찾는 검증이 있으므로, I18nProvider가 읽는 저장값을 ko로 고정해 브라우저 기본 언어
// (jsdom은 en-US)에 흔들리지 않게 한다.
beforeEach(() => {
  window.localStorage.setItem('melly-locale', 'ko')
})
function renderNavigation() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <TopNavigation
          brand="Melly"
          items={[
            { label: '팬미팅', to: '/meetings' },
            { label: '알림', to: '/notifications' },
          ]}
        />
        <main id="main-content" tabIndex={-1} />
      </MemoryRouter>
    </I18nProvider>,
  )
}

describe('TopNavigation', () => {
  it('본문 바로가기 링크로 해시와 포커스를 함께 이동한다', async () => {
    const user = userEvent.setup()
    renderNavigation()
    const skipLink = screen.getByRole('link', { name: '본문으로 건너뛰기' })
    expect(skipLink.getAttribute('href')).toBe('#main-content')

    await user.click(skipLink)
    expect(document.activeElement?.getAttribute('id')).toBe('main-content')
  })

  it('모바일 메뉴의 열림 상태와 컨텐츠를 aria-controls로 연결한다', async () => {
    const user = userEvent.setup()
    renderNavigation()
    const menuButton = screen.getByText('메뉴')

    expect(menuButton.getAttribute('aria-expanded')).toBe('false')
    await user.click(menuButton)
    await waitFor(() => expect(menuButton.getAttribute('aria-expanded')).toBe('true'))

    const controlledId = menuButton.getAttribute('aria-controls')
    expect(controlledId).not.toBeNull()
    expect(document.getElementById(controlledId ?? '')).not.toBeNull()
  })

  it('Escape 키로 메뉴를 닫고 열기 버튼으로 포커스를 돌려준다', async () => {
    const user = userEvent.setup()
    const { container } = renderNavigation()
    const menuButton = screen.getByText('메뉴')
    await user.click(menuButton)
    await waitFor(() => expect(menuButton.getAttribute('aria-expanded')).toBe('true'))

    const details = container.querySelector('details')
    expect(details).not.toBeNull()
    fireEvent.keyDown(details as HTMLDetailsElement, { key: 'Escape' })

    expect(menuButton.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(menuButton)
  })
})
