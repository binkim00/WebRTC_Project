import { ArrowLeft, ArrowRight } from '@phosphor-icons/react'
import { cn } from '../ui/cn'

type PageItem = number | 'ellipsis-start' | 'ellipsis-end'

function createPageItems(currentPage: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis-end', totalPages]
  }

  if (currentPage >= totalPages - 3) {
    return [
      1,
      'ellipsis-start',
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ]
  }

  return [
    1,
    'ellipsis-start',
    currentPage - 1,
    currentPage,
    currentPage + 1,
    'ellipsis-end',
    totalPages,
  ]
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
    <nav
      aria-label="페이지 이동"
      className={cn('flex flex-wrap items-center justify-center gap-5', className)}
    >
      <button
        aria-label="이전 페이지"
        className="inline-flex size-12 items-center justify-center text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:text-[var(--color-divider)]"
        disabled={safeCurrent === 1}
        onClick={() => onPageChange(safeCurrent - 1)}
        type="button"
      >
        <ArrowLeft aria-hidden size={28} />
      </button>

      {pageItems.map((item) =>
        typeof item === 'number' ? (
          <button
            aria-current={item === safeCurrent ? 'page' : undefined}
            aria-label={`${item}페이지`}
            className={cn(
              'inline-flex size-12 items-center justify-center rounded-xl border text-base font-bold transition-colors',
              item === safeCurrent
                ? 'border-[var(--color-primary-coral-soft-border)] bg-[var(--color-primary-coral-soft)] text-[var(--color-primary-coral)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
            )}
            key={item}
            onClick={() => onPageChange(item)}
            type="button"
          >
            {item}
          </button>
        ) : (
          <span
            aria-hidden
            className="px-1 text-[var(--color-text-tertiary)]"
            key={item}
          >
            …
          </span>
        ),
      )}

      <button
        aria-label="다음 페이지"
        className="inline-flex size-12 items-center justify-center text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:text-[var(--color-divider)]"
        disabled={safeCurrent === safeTotal}
        onClick={() => onPageChange(safeCurrent + 1)}
        type="button"
      >
        <ArrowRight aria-hidden size={28} />
      </button>
    </nav>
  )
}
