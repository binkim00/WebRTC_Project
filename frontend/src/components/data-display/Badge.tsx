import type { HTMLAttributes } from 'react'
import { cn } from '../ui/cn'

export type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant
}

const badgeClasses: Record<BadgeVariant, string> = {
  neutral: 'text-[var(--color-text-secondary)]',
  primary: 'text-[var(--color-primary-coral)]',
  success: 'text-[var(--color-success)]',
  warning: 'text-[var(--color-warning)]',
  danger: 'text-[var(--color-error)]',
  info: 'text-[var(--color-primary-coral)]',
}

export function Badge({ variant = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'mj-font-label inline text-sm',
        badgeClasses[variant],
        className,
      )}
      {...props}
    />
  )
}
