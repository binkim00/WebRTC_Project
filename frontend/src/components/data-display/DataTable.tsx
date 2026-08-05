import type { Key, ReactNode } from 'react'
import { cn } from '../ui/cn'

export type SortDirection = 'asc' | 'desc'

export type DataTableColumn<T> = {
  id: string
  header: ReactNode
  cell: (row: T, index: number) => ReactNode
  align?: 'left' | 'center' | 'right'
  sortable?: boolean
}

export type DataTableProps<T> = {
  columns: readonly DataTableColumn<T>[]
  rows: readonly T[]
  rowKey: (row: T, index: number) => Key
  caption?: string
  emptyMessage?: string
  sort?: {
    columnId: string
    direction: SortDirection
  }
  onSort?: (columnId: string, direction: SortDirection) => void
  className?: string
}

const alignClasses = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} as const

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  emptyMessage = '표시할 데이터가 없습니다.',
  sort,
  onSort,
  className,
}: DataTableProps<T>) {
  function changeSort(columnId: string) {
    const nextDirection: SortDirection =
      sort?.columnId === columnId && sort.direction === 'asc' ? 'desc' : 'asc'
    onSort?.(columnId, nextDirection)
  }

  return (
    <div
      className={cn(
        'overflow-x-auto rounded-[var(--radius-panel)] border border-[var(--color-border-panel)]',
        className,
      )}
    >
      <table className="min-w-full border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="bg-[var(--color-surface-page)]">
          <tr>
            {columns.map((column) => {
              const alignment = column.align ?? 'left'
              const sorted = sort?.columnId === column.id
              return (
                <th
                  aria-sort={
                    sorted ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                  className={cn(
                    'mj-font-label border-b border-[var(--color-divider)] px-4 py-3 text-[var(--color-text-body)]',
                    alignClasses[alignment],
                  )}
                  key={column.id}
                  scope="col"
                >
                  {column.sortable && onSort ? (
                    <button
                      className="inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-control)] focus-visible:outline-none focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]"
                      onClick={() => changeSort(column.id)}
                      type="button"
                    >
                      {column.header}
                      <span aria-hidden="true">
                        {sorted ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="bg-[var(--color-surface-panel)]">
          {rows.length > 0 ? (
            rows.map((row, rowIndex) => (
              <tr
                className="border-b border-[var(--color-border-row)] transition-colors last:border-b-0 hover:bg-[var(--color-surface-page)] motion-reduce:transition-none"
                key={rowKey(row, rowIndex)}
              >
                {columns.map((column) => (
                  <td
                    className={cn(
                      'mj-font-body whitespace-nowrap px-4 py-3 text-[var(--color-text-body)]',
                      alignClasses[column.align ?? 'left'],
                    )}
                    key={column.id}
                  >
                    {column.cell(row, rowIndex)}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td
                className="mj-font-body px-4 py-10 text-center text-[var(--color-text-muted)]"
                colSpan={columns.length}
              >
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
