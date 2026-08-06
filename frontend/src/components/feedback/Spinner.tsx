import { cn } from '../ui/cn'
import { useTranslation } from '../../i18n'

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

export function Spinner({ label, size = 'md', className }: SpinnerProps) {
  const { t } = useTranslation()
  // 기본 문구는 파라미터 기본값이 아니라 본문에서 정한다. 파라미터 기본값은 훅보다 먼저
  // 평가되므로 그 자리에서는 t를 쓸 수 없다.
  const resolvedLabel = label ?? t('spinner.t1')
  return (
    <span className={cn('inline-flex items-center gap-2', className)} role="status">
      <span
        aria-hidden="true"
        className={cn(
          'animate-spin rounded-full border-[var(--color-primary-coral-soft-border)] border-r-[var(--color-primary-coral)]',
          spinnerSizeClasses[size],
        )}
      />
      <span className="sr-only">{resolvedLabel}</span>
    </span>
  )
}
