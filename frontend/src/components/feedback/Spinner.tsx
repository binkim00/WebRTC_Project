import { cn } from '../ui/cn'

export type SpinnerProps = {
  label?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const spinnerSizeClasses = {
  sm: 'size-4 border-2',
  md: 'size-7 border-[3px]',
  lg: 'size-10 border-4',
} as const

export function Spinner({ label = '불러오는 중', size = 'md', className }: SpinnerProps) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)} role="status">
      <span
        aria-hidden="true"
        className={cn(
          'animate-spin rounded-full border-[var(--color-primary-coral-soft-border)] border-r-[var(--color-primary-coral)]',
          spinnerSizeClasses[size],
        )}
      />
      <span className="sr-only">{label}</span>
    </span>
  )
}
