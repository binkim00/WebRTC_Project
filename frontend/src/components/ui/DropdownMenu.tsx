import { useRef, type ReactNode } from 'react'
import { cn } from './cn'

export type DropdownMenuItem = {
  id: string
  label: ReactNode
  onSelect?: () => void
  disabled?: boolean
  danger?: boolean
}

export type DropdownMenuProps = {
  label: ReactNode
  items: readonly DropdownMenuItem[]
  align?: 'start' | 'end'
  className?: string
  menuClassName?: string
}

export function DropdownMenu({
  label,
  items,
  align = 'start',
  className,
  menuClassName,
}: DropdownMenuProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null)

  function selectItem(item: DropdownMenuItem) {
    if (item.disabled) {
      return
    }

    item.onSelect?.()
    detailsRef.current?.removeAttribute('open')
  }

  return (
    <details className={cn('group relative inline-block', className)} ref={detailsRef}>
      <summary
        className={cn(
          'inline-flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-300',
          'bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2',
          '[&::-webkit-details-marker]:hidden',
        )}
      >
        {label}
        <span aria-hidden="true" className="text-xs transition group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div
        className={cn(
          'absolute z-30 mt-2 min-w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg',
          align === 'end' ? 'right-0' : 'left-0',
          menuClassName,
        )}
      >
        {items.map((item) => (
          <button
            className={cn(
              'flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition',
              item.danger
                ? 'text-red-700 hover:bg-red-50'
                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
              'disabled:cursor-not-allowed disabled:opacity-45',
            )}
            disabled={item.disabled}
            key={item.id}
            onClick={() => selectItem(item)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
    </details>
  )
}
