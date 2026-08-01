import type { ReactNode } from 'react'
import { cn } from '../ui/cn'

export type TabItem = {
  value: string
  label: ReactNode
  disabled?: boolean
}

export type TabsProps = {
  items: readonly TabItem[]
  value: string
  onValueChange: (value: string) => void
  ariaLabel?: string
  className?: string
}

export function Tabs({
  items,
  value,
  onValueChange,
  ariaLabel = '화면 탭',
  className,
}: TabsProps) {
  return (
    <div
      aria-label={ariaLabel}
      className={cn(
        'flex min-h-14 gap-7 overflow-x-auto overflow-y-hidden border-b border-[var(--color-divider)]',
        className,
      )}
      role="tablist"
    >
      {items.map((item) => {
        const selected = item.value === value
        return (
          <button
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
            key={item.value}
            onClick={() => onValueChange(item.value)}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
