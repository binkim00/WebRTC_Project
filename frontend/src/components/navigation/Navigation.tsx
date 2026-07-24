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
            'rounded-lg px-3 py-2 text-sm font-medium transition',
            isActive
              ? 'bg-violet-100 text-violet-800'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
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
    <header className={cn('border-b border-slate-200 bg-white', className)}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <Link className="text-xl font-bold tracking-tight text-violet-700" to={brandTo}>
          {brand}
        </Link>
        <nav aria-label={ariaLabel} className="hidden items-center gap-1 md:flex">
          {navigationLinks()}
        </nav>
        <div className="hidden items-center gap-2 md:flex">{actions}</div>
        <details className="relative md:hidden" ref={mobileMenuRef}>
          <summary
            aria-label="모바일 메뉴 열기"
            className="cursor-pointer list-none rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden"
          >
            메뉴
          </summary>
          <div className="absolute right-0 z-30 mt-2 grid min-w-56 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
            <nav aria-label={`${ariaLabel} 모바일`} className="grid">
              {navigationLinks(true)}
            </nav>
            {actions ? <div className="mt-1 border-t border-slate-100 pt-2">{actions}</div> : null}
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
      className={cn('flex gap-1 border-b border-slate-200', className)}
      role="tablist"
    >
      {items.map((item) => {
        const selected = item.value === value
        return (
          <button
            aria-selected={selected}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition',
              selected
                ? 'border-violet-700 text-violet-700'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-inset',
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
      <ol className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1
          return (
            <li className="flex items-center gap-2" key={`${index}-${String(item.label)}`}>
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              {item.to && !isCurrent ? (
                <Link className="hover:text-violet-700 hover:underline" to={item.to}>
                  {item.label}
                </Link>
              ) : (
                <span aria-current={isCurrent ? 'page' : undefined} className={isCurrent ? 'text-slate-900' : ''}>
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
          <span aria-hidden="true" className="px-2 text-slate-400" key={item}>
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
                  'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold',
                  complete && 'border-violet-700 bg-violet-700 text-white',
                  current && 'border-violet-700 bg-white text-violet-700',
                  !complete && !current && 'border-slate-300 bg-white text-slate-400',
                )}
              >
                {complete ? '✓' : index + 1}
              </span>
              {index < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'ml-2 hidden h-0.5 flex-1 sm:block',
                    complete ? 'bg-violet-700' : 'bg-slate-200',
                  )}
                />
              ) : null}
            </div>
            <div>
              <p className={cn('text-sm font-semibold', current ? 'text-violet-700' : 'text-slate-800')}>
                {step.label}
              </p>
              {step.description ? <p className="mt-1 text-sm text-slate-500">{step.description}</p> : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
