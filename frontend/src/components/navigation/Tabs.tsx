import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '../ui/cn'

export type TabItem = {
  value: string
  label: ReactNode
  disabled?: boolean
  /** 탭 패널을 함께 구현할 때 명시적인 aria 연결에 사용한다. */
  tabId?: string
  panelId?: string
}

export type TabsProps = {
  items: readonly TabItem[]
  value: string
  onValueChange: (value: string) => void
  /** automatic은 방향키 이동과 동시에 선택하고, manual은 Enter/Space로 선택한다. */
  activationMode?: 'automatic' | 'manual'
  ariaLabel?: string
  className?: string
}

export function Tabs({
  items,
  value,
  onValueChange,
  activationMode = 'automatic',
  ariaLabel = '화면 탭',
  className,
}: TabsProps) {
  const generatedId = useId().replaceAll(':', '')
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())
  const selectedEnabledItem = items.find((item) => item.value === value && !item.disabled)
  const fallbackTabValue = items.find((item) => !item.disabled)?.value

  /** WAI-ARIA 탭 패턴에 맞춰 비활성 탭을 건너뛰며 순환 이동한다. */
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentValue: string) {
    const enabledItems = items.filter((item) => !item.disabled)
    if (enabledItems.length === 0) return

    const currentIndex = enabledItems.findIndex((item) => item.value === currentValue)
    let nextIndex: number | undefined

    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = enabledItems.length - 1
    if (event.key === 'ArrowRight') {
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % enabledItems.length
    }
    if (event.key === 'ArrowLeft') {
      nextIndex = currentIndex < 0
        ? enabledItems.length - 1
        : (currentIndex - 1 + enabledItems.length) % enabledItems.length
    }

    if (nextIndex === undefined) return

    const nextItem = enabledItems[nextIndex]
    if (!nextItem) return

    event.preventDefault()
    tabRefs.current.get(nextItem.value)?.focus()
    if (activationMode === 'automatic') onValueChange(nextItem.value)
  }

  return (
    <div
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      className={cn(
        'flex min-h-14 gap-7 overflow-x-auto overflow-y-hidden border-b border-[var(--color-divider)]',
        className,
      )}
      role="tablist"
    >
      {items.map((item, index) => {
        const selected = item.value === value && !item.disabled
        const isFallbackTab = !selectedEnabledItem && item.value === fallbackTabValue
        return (
          <button
            aria-controls={item.panelId}
            aria-selected={selected}
            className={cn(
              'relative -mb-px inline-flex min-h-14 shrink-0 items-center border-b-[3px] px-0 text-[15px] font-semibold',
              'transition-colors duration-200 motion-reduce:transition-none',
              selected
                ? 'border-[var(--color-primary-coral)] text-[var(--color-primary-coral)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
              'focus-visible:[outline-offset:-3px]',
              'disabled:cursor-not-allowed disabled:opacity-45',
            )}
            disabled={item.disabled}
            id={item.tabId ?? `${generatedId}-tab-${index}`}
            key={item.value}
            onClick={() => onValueChange(item.value)}
            onKeyDown={(event) => handleKeyDown(event, item.value)}
            ref={(node) => {
              if (node) tabRefs.current.set(item.value, node)
              else tabRefs.current.delete(item.value)
            }}
            role="tab"
            tabIndex={!item.disabled && (selected || isFallbackTab) ? 0 : -1}
            type="button"
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
