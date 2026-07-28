import type { HTMLAttributes, Key, ReactNode } from 'react'
import { cn } from '../ui/cn'

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean
  selected?: boolean
}

export function Card({ interactive, selected, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-panel)] border bg-[var(--color-surface-panel)]',
        selected
          ? 'border-[var(--color-primary-coral)] shadow-[0_0_0_3px_var(--color-primary-coral-soft-border)]'
          : 'border-[var(--color-border-panel)] shadow-[var(--shadow-panel)]',
        interactive &&
          'transition-[border-color,box-shadow] duration-200 hover:border-[var(--color-primary-coral-soft-border)] motion-reduce:transition-none',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-b border-[var(--color-divider)] p-5 sm:p-6', className)} {...props} />
}

export type CardTitleProps = HTMLAttributes<HTMLHeadingElement> & {
  as?: 'h1' | 'h2' | 'h3' | 'h4'
}

export function CardTitle({ as: Heading = 'h3', className, ...props }: CardTitleProps) {
  return <Heading className={cn('text-lg font-bold text-[var(--color-text-primary)]', className)} {...props} />
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 sm:p-6', className)} {...props} />
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-t border-[var(--color-divider)] p-5 sm:p-6', className)} {...props} />
}

export function List({ className, ...props }: HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn('divide-y divide-slate-200', className)} {...props} />
}

export function ListItem({ className, ...props }: HTMLAttributes<HTMLLIElement>) {
  return <li className={cn('px-4 py-3', className)} {...props} />
}

export type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant
}

const badgeClasses: Record<BadgeVariant, string> = {
  neutral:
    'border-[var(--color-border-control)] bg-[var(--color-surface-page)] text-[var(--color-text-secondary)]',
  primary:
    'border-[var(--color-primary-coral-soft-border)] bg-[var(--color-primary-coral-soft)] text-[var(--color-primary-coral-hover)]',
  success:
    'border-[var(--color-success-border)] bg-[var(--color-success-soft)] text-[var(--color-success)]',
  warning:
    'border-[var(--color-warning-border)] bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
  danger: 'border-[var(--color-error-border)] bg-[var(--color-error-soft)] text-[var(--color-error)]',
  info:
    'border-[var(--color-primary-coral-soft-border)] bg-[var(--color-primary-coral-soft)] text-[var(--color-primary-coral-hover)]',
}

export function Badge({ variant = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex min-h-[30px] items-center justify-center rounded-[var(--radius-control)] border px-2.5 py-1 text-xs font-bold',
        badgeClasses[variant],
        className,
      )}
      {...props}
    />
  )
}

export type ChipProps = HTMLAttributes<HTMLSpanElement> & {
  selected?: boolean
  disabled?: boolean
  onRemove?: () => void
  removeLabel?: string
}

export function Chip({
  selected,
  disabled,
  onRemove,
  removeLabel = '항목 제거',
  className,
  children,
  ...props
}: ChipProps) {
  return (
    <span
      aria-disabled={disabled || undefined}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium',
        selected
          ? 'border-violet-300 bg-violet-100 text-violet-800'
          : 'border-slate-300 bg-white text-slate-700',
        disabled && 'opacity-45',
        className,
      )}
      {...props}
    >
      {children}
      {onRemove ? (
        <button
          aria-label={removeLabel}
          className="rounded-full px-1 hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          disabled={disabled}
          onClick={onRemove}
          type="button"
        >
          ×
        </button>
      ) : null}
    </span>
  )
}

export type AvatarProps = {
  name: string
  src?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const avatarSizeClasses = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-base',
} as const

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const fallback = name.trim().slice(0, 2).toUpperCase()

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-violet-100 font-bold text-violet-800',
        avatarSizeClasses[size],
        className,
      )}
    >
      {src ? <img alt={name} className="size-full object-cover" src={src} /> : fallback}
    </span>
  )
}

export type TooltipProps = {
  content: ReactNode
  children: ReactNode
  className?: string
}

export function Tooltip({ content, children, className }: TooltipProps) {
  return (
    <span className={cn('group relative inline-flex', className)} tabIndex={0}>
      {children}
      <span
        className={cn(
          'pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 hidden -translate-x-1/2 whitespace-nowrap',
          'rounded-md bg-slate-950 px-2 py-1 text-xs text-white shadow-lg',
          'group-hover:block group-focus:block group-focus-within:block',
        )}
        role="tooltip"
      >
        {content}
      </span>
    </span>
  )
}

export type EmptyStateProps = {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <section className={cn('rounded-2xl border border-dashed border-slate-300 p-8 text-center', className)}>
      {icon ? <div className="mx-auto mb-4 text-4xl text-slate-400">{icon}</div> : null}
      <h3 className="text-lg font-bold text-slate-950">{title}</h3>
      {description ? <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  )
}

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
                  className={cn('px-4 py-3 font-semibold text-slate-700', alignClasses[alignment])}
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
                      <span aria-hidden="true">{sorted ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
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
