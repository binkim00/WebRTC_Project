import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

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
