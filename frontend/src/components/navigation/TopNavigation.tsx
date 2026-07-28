import { useRef, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
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
