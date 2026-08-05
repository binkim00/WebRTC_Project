import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { cn } from '../ui/cn'
import { NotificationBell } from './NotificationBell'

export type NavigationItem = {
  label: ReactNode
  to: string
  end?: boolean
}

export type TopNavigationProps = {
  brand: ReactNode
  brandTo?: string
  items: readonly NavigationItem[]
  centerContent?: ReactNode
  actions?: ReactNode
  ariaLabel?: string
  className?: string
  skipLinkLabel?: string
  skipLinkTargetId?: string
}

export function TopNavigation({
  brand,
  brandTo = '/',
  items,
  centerContent,
  actions,
  ariaLabel = '주요 메뉴',
  className,
  skipLinkLabel = '본문으로 건너뛰기',
  skipLinkTargetId = 'main-content',
}: TopNavigationProps) {
  const mobileMenuRef = useRef<HTMLDetailsElement>(null)
  const mobileMenuButtonRef = useRef<HTMLElement>(null)
  const mobileMenuId = `${useId().replaceAll(':', '')}-mobile-navigation`
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const hasMobileMenu = items.length > 0 || Boolean(actions)

  useEffect(() => {
    if (!mobileMenuOpen) return

    /** 메뉴 바깥을 누르면 작은 화면에서 메뉴가 콘텐츠를 계속 가리지 않도록 닫는다. */
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !mobileMenuRef.current?.contains(event.target)) {
        setMobileMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [mobileMenuOpen])

  function handleMobileMenuKeyDown(event: KeyboardEvent<HTMLDetailsElement>) {
    if (event.key !== 'Escape' || !mobileMenuOpen) return

    event.preventDefault()
    setMobileMenuOpen(false)
    mobileMenuButtonRef.current?.focus()
  }

  function focusMainContent() {
    // 해시 이동만으로 포커스가 바뀌지 않는 브라우저에서도 스크린 리더 위치를 함께 옮긴다.
    document.getElementById(skipLinkTargetId)?.focus()
  }

  const navigationLinks = (mobile = false) =>
    items.map((item) => {
      // 알림 항목은 데스크톱에서 화면 이동 대신 벨+드롭다운 패널로 동작한다.
      // 좁은 화면 메뉴에서는 패널을 겹칠 자리가 없어 기존 전체 화면 링크를 유지한다.
      if (item.to === '/notifications' && !mobile) {
        return (
          <span className="flex items-center" key="desktop-notification-bell">
            <NotificationBell />
          </span>
        )
      }

      return (
      <NavLink
        className={({ isActive }) =>
          cn(
            'mj-font-label relative inline-flex min-h-11 items-center whitespace-nowrap px-1 text-[15px]',
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
        onClick={mobile ? () => setMobileMenuOpen(false) : undefined}
        to={item.to}
      >
        {item.label}
      </NavLink>
      )
    })

  return (
    <header
      className={cn(
        'h-[var(--service-header-height)] border-b border-[var(--color-divider)] bg-[var(--color-surface-panel)]',
        className,
      )}
    >
      <a className="skip-link" href={`#${skipLinkTargetId}`} onClick={focusMainContent}>
        {skipLinkLabel}
      </a>
      <div className="relative mx-auto flex h-full w-full max-w-[1360px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
        <Link
          className="mj-font-title shrink-0 text-[28px] tracking-[-0.06em] text-[var(--color-text-primary)]"
          to={brandTo}
        >
          {brand}
        </Link>
        {centerContent ? (
          <div className="absolute left-1/2 hidden -translate-x-1/2 items-center lg:flex">
            {centerContent}
          </div>
        ) : (
          <nav aria-label={ariaLabel} className="hidden h-full items-stretch gap-10 lg:flex">
            {navigationLinks()}
          </nav>
        )}
        {actions ? <div className="hidden shrink-0 items-center gap-2 lg:flex">{actions}</div> : null}
        {hasMobileMenu ? (
          <details
            className="relative lg:hidden"
            onKeyDown={handleMobileMenuKeyDown}
            onToggle={(event) => setMobileMenuOpen(event.currentTarget.open)}
            open={mobileMenuOpen}
            ref={mobileMenuRef}
          >
            <summary
              aria-controls={mobileMenuId}
              aria-expanded={mobileMenuOpen}
              aria-label={`모바일 메뉴 ${mobileMenuOpen ? '닫기' : '열기'}`}
              className="mj-font-label inline-flex min-h-11 cursor-pointer list-none items-center rounded-[var(--radius-control)] border border-[var(--color-border-control)] bg-[var(--color-surface-panel)] px-3 text-sm text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-page)] [&::-webkit-details-marker]:hidden"
              ref={mobileMenuButtonRef}
            >
              메뉴
            </summary>
            <div
              className="absolute right-0 z-30 mt-2 grid min-w-56 gap-1 rounded-[var(--radius-panel)] border border-[var(--color-border-panel)] bg-[var(--color-surface-panel)] p-2 shadow-[var(--shadow-modal)]"
              id={mobileMenuId}
            >
              <nav aria-label={`${ariaLabel} 모바일`} className="grid">
                {navigationLinks(true)}
              </nav>
              {actions ? (
                <div
                  className="mt-1 border-t border-[var(--color-divider)] pt-2"
                  onClickCapture={() => setMobileMenuOpen(false)}
                >
                  {actions}
                </div>
              ) : null}
            </div>
          </details>
        ) : null}
      </div>
    </header>
  )
}
