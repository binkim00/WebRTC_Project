// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { TopNavigation } from './TopNavigation'

afterEach(cleanup)

function renderNavigation() {
  return render(
    <MemoryRouter>
      <TopNavigation
        brand="Melly"
        items={[
          { label: '팬미팅', to: '/meetings' },
          { label: '알림', to: '/notifications' },
        ]}
      />
      <main id="main-content" tabIndex={-1} />
    </MemoryRouter>,
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
