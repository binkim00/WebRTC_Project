import { Button } from '../ui/Button'
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
    <nav
      aria-label="페이지 이동"
      className={cn('flex flex-wrap items-center justify-center gap-1', className)}
    >
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
          <span
            aria-hidden="true"
            className="px-2 text-[var(--color-text-tertiary)]"
            key={item}
          >
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
