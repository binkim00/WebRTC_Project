// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { Tabs } from './Tabs'

/**
 * Tabs는 기본 aria-label을 사전에서 가져오므로 실제 사용처와 같이 Provider 안에서 렌더링한다.
 */
function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>)
}

afterEach(cleanup)

describe('Tabs', () => {
  it('방향키로 비활성 탭을 건너뛰고 선택과 포커스를 함께 이동한다', () => {
    const onValueChange = vi.fn()
    renderWithI18n(
      <Tabs
        items={[
          { value: 'upcoming', label: '예정' },
          { value: 'disabled', label: '비활성', disabled: true },
          { value: 'completed', label: '완료' },
        ]}
        onValueChange={onValueChange}
        value="upcoming"
      />,
    )

    const upcomingTab = screen.getByRole('tab', { name: '예정' })
    const completedTab = screen.getByRole('tab', { name: '완료' })
    upcomingTab.focus()
    fireEvent.keyDown(upcomingTab, { key: 'ArrowRight' })

    expect(document.activeElement).toBe(completedTab)
    expect(onValueChange).toHaveBeenCalledWith('completed')
  })

  it('Home/End 키와 탭-패널 ARIA 연결을 제공한다', () => {
    const onValueChange = vi.fn()
    renderWithI18n(
      <Tabs
        ariaLabel="팬 기록 종류"
        items={[
          { value: 'memo', label: '메모', tabId: 'memo-tab', panelId: 'memo-panel' },
          { value: 'history', label: '통화 기록' },
        ]}
        onValueChange={onValueChange}
        value="memo"
      />,
    )

    const memoTab = screen.getByRole('tab', { name: '메모' })
    const historyTab = screen.getByRole('tab', { name: '통화 기록' })
    expect(memoTab.getAttribute('id')).toBe('memo-tab')
    expect(memoTab.getAttribute('aria-controls')).toBe('memo-panel')
    expect(memoTab.getAttribute('tabindex')).toBe('0')
    expect(historyTab.getAttribute('tabindex')).toBe('-1')

    fireEvent.keyDown(memoTab, { key: 'End' })
    expect(document.activeElement).toBe(historyTab)
    expect(onValueChange).toHaveBeenLastCalledWith('history')
  })

  it('수동 활성화 모드에서는 방향키가 포커스만 이동한다', () => {
    const onValueChange = vi.fn()
    renderWithI18n(
      <Tabs
        activationMode="manual"
        items={[
          { value: 'first', label: '첫 번째' },
          { value: 'second', label: '두 번째' },
        ]}
        onValueChange={onValueChange}
        value="first"
      />,
    )

    const firstTab = screen.getByRole('tab', { name: '첫 번째' })
    const secondTab = screen.getByRole('tab', { name: '두 번째' })
    firstTab.focus()
    fireEvent.keyDown(firstTab, { key: 'ArrowRight' })

    expect(document.activeElement).toBe(secondTab)
    expect(onValueChange).not.toHaveBeenCalled()
  })
})
