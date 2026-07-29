import type { HTMLAttributes } from 'react'
import { cn } from '../ui/cn'

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
  danger:
    'border-[var(--color-error-border)] bg-[var(--color-error-soft)] text-[var(--color-error)]',
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
