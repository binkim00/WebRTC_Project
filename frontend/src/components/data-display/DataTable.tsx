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
    <div className={cn('overflow-x-auto rounded-xl border border-slate-200', className)}>
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="bg-slate-50">
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
                    'px-4 py-3 font-semibold text-slate-700',
                    alignClasses[alignment],
                  )}
                  key={column.id}
                  scope="col"
                >
                  {column.sortable && onSort ? (
                    <button
                      className="inline-flex items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
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
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.length > 0 ? (
            rows.map((row, rowIndex) => (
              <tr className="hover:bg-slate-50" key={rowKey(row, rowIndex)}>
                {columns.map((column) => (
                  <td
                    className={cn(
                      'whitespace-nowrap px-4 py-3 text-slate-700',
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
              <td className="px-4 py-10 text-center text-slate-500" colSpan={columns.length}>
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
