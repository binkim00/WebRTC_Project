import { useRef, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Button } from '../ui/Button'
import { cn } from '../ui/cn'

export type NavigationItem = {
  label: ReactNode
  to: string
  end?: boolean
}

export type TopNavigationProps = {
  brand: ReactNode
  brandTo?: string
  items: readonly NavigationItem[]
  actions?: ReactNode
  ariaLabel?: string
  className?: string
}

export function TopNavigation({
  brand,
  brandTo = '/',
  items,
  actions,
  ariaLabel = '주요 메뉴',
  className,
}: TopNavigationProps) {
  const mobileMenuRef = useRef<HTMLDetailsElement>(null)

  const navigationLinks = (mobile = false) =>
    items.map((item) => (
      <NavLink
        className={({ isActive }) =>
          cn(
            'relative inline-flex min-h-11 items-center whitespace-nowrap px-1 text-[15px] font-semibold',
            'transition-colors duration-200 motion-reduce:transition-none',
            "after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:rounded-t-[3px] after:bg-transparent after:content-['']",
            isActive
              ? 'text-[var(--color-primary-coral)] after:bg-[var(--color-primary-coral)]'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
            mobile &&
              'w-full rounded-[var(--radius-control)] px-3 after:hidden hover:bg-[var(--color-surface-page)]',
            mobile && isActive && 'bg-[var(--color-primary-coral-soft)]',
          )
        }
        end={item.end}
        key={`${mobile ? 'mobile' : 'desktop'}-${item.to}`}
        onClick={mobile ? () => mobileMenuRef.current?.removeAttribute('open') : undefined}
        to={item.to}
      >
        {item.label}
      </NavLink>
    ))

  return (
    <header
      className={cn(
        'h-[var(--service-header-height)] border-b border-[var(--color-divider)] bg-[var(--color-surface-panel)]',
        className,
      )}
    >
      <div className="mx-auto flex h-full w-full max-w-[1360px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
        <Link
          className="shrink-0 text-[28px] font-black tracking-[-0.055em] text-[var(--color-text-primary)]"
          to={brandTo}
        >
          {brand}
        </Link>
        <nav aria-label={ariaLabel} className="hidden h-full items-stretch gap-8 md:flex lg:gap-10">
          {navigationLinks()}
        </nav>
        {actions ? <div className="hidden shrink-0 items-center gap-2 md:flex">{actions}</div> : null}
        <details className="relative md:hidden" ref={mobileMenuRef}>
          <summary
            aria-label="모바일 메뉴 열기"
            className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-[var(--radius-control)] border border-[var(--color-border-control)] bg-[var(--color-surface-panel)] px-3 text-sm font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-page)] [&::-webkit-details-marker]:hidden"
          >
            메뉴
          </summary>
          <div className="absolute right-0 z-30 mt-2 grid min-w-56 gap-1 rounded-[var(--radius-panel)] border border-[var(--color-border-panel)] bg-[var(--color-surface-panel)] p-2 shadow-[var(--shadow-modal)]">
            <nav aria-label={`${ariaLabel} 모바일`} className="grid">
              {navigationLinks(true)}
            </nav>
            {actions ? (
              <div className="mt-1 border-t border-[var(--color-divider)] pt-2">{actions}</div>
            ) : null}
          </div>
        </details>
      </div>
    </header>
  )
}

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
        'flex min-h-14 gap-7 overflow-x-auto border-b border-[var(--color-divider)]',
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

export type BreadcrumbItem = {
  label: ReactNode
  to?: string
}

export type BreadcrumbsProps = {
  items: readonly BreadcrumbItem[]
  className?: string
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav aria-label="현재 위치" className={className}>
      <ol className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-secondary)]">
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1
          return (
            <li className="flex items-center gap-2" key={`${index}-${String(item.label)}`}>
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              {item.to && !isCurrent ? (
                <Link
                  className="rounded-sm transition-colors hover:text-[var(--color-primary-coral)] hover:underline motion-reduce:transition-none"
                  to={item.to}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isCurrent ? 'page' : undefined}
                  className={isCurrent ? 'font-semibold text-[var(--color-text-primary)]' : ''}
                >
                  {item.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

type PageItem = number | 'ellipsis-start' | 'ellipsis-end'

function createPageItems(currentPage: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis-end', totalPages]
  }

  if (currentPage >= totalPages - 3) {
    return [1, 'ellipsis-start', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
  }

  return [1, 'ellipsis-start', currentPage - 1, currentPage, currentPage + 1, 'ellipsis-end', totalPages]
}

export type PaginationProps = {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  className?: string
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  className,
}: PaginationProps) {
  const safeTotal = Math.max(1, Math.floor(totalPages))
  const safeCurrent = Math.min(Math.max(1, Math.floor(currentPage)), safeTotal)
  const pageItems = createPageItems(safeCurrent, safeTotal)

  return (
    <nav aria-label="페이지 이동" className={cn('flex flex-wrap items-center justify-center gap-1', className)}>
      <Button
        aria-label="이전 페이지"
        disabled={safeCurrent === 1}
        onClick={() => onPageChange(safeCurrent - 1)}
        size="sm"
        variant="outline"
      >
        이전
      </Button>
      {pageItems.map((item) =>
        typeof item === 'number' ? (
          <Button
            aria-current={item === safeCurrent ? 'page' : undefined}
            aria-label={`${item}페이지`}
            key={item}
            onClick={() => onPageChange(item)}
            size="sm"
            variant={item === safeCurrent ? 'primary' : 'ghost'}
          >
            {item}
          </Button>
        ) : (
          <span aria-hidden="true" className="px-2 text-[var(--color-text-tertiary)]" key={item}>
            …
          </span>
        ),
      )}
      <Button
        aria-label="다음 페이지"
        disabled={safeCurrent === safeTotal}
        onClick={() => onPageChange(safeCurrent + 1)}
        size="sm"
        variant="outline"
      >
        다음
      </Button>
    </nav>
  )
}

export type StepItem = {
  label: ReactNode
  description?: string
}

export type StepperProps = {
  steps: readonly StepItem[]
  activeStep: number
  className?: string
}

export function Stepper({ steps, activeStep, className }: StepperProps) {
  return (
    <ol className={cn('grid gap-4 sm:grid-flow-col sm:auto-cols-fr', className)}>
      {steps.map((step, index) => {
        const complete = index < activeStep
        const current = index === activeStep
        return (
          <li
            aria-current={current ? 'step' : undefined}
            className="relative flex gap-3 sm:block"
            key={`${index}-${String(step.label)}`}
          >
            <div className="flex items-center sm:mb-2">
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold',
                  complete && 'border-[var(--color-success)] bg-[var(--color-success)] text-white',
                  current &&
                    'border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] text-white shadow-[0_0_0_5px_var(--color-primary-coral-soft)]',
                  !complete &&
                    !current &&
                    'border-[var(--color-border-control)] bg-[var(--color-surface-page)] text-[var(--color-text-tertiary)]',
                )}
              >
                {complete ? '✓' : index + 1}
              </span>
              {index < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'ml-2 hidden h-0.5 flex-1 sm:block',
                    complete ? 'bg-[var(--color-success-border)]' : 'bg-[var(--color-divider)]',
                  )}
                />
              ) : null}
            </div>
            <div>
              <p
                className={cn(
                  'text-sm font-semibold',
                  complete && 'text-[var(--color-success)]',
                  current && 'text-[var(--color-primary-coral-hover)]',
                  !complete && !current && 'text-[var(--color-text-primary)]',
                )}
              >
                {step.label}
              </p>
              {step.description ? (
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{step.description}</p>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
