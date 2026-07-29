import type { ReactNode } from 'react'
import { cn } from '../ui/cn'

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
