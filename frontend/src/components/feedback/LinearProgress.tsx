import { cn } from '../ui/cn'
import { useTranslation } from '../../i18n'

export type LinearProgressProps = {
  value?: number
  label?: string
  showValue?: boolean
  className?: string
}

export function LinearProgress({
  value,
  label,
  showValue = true,
  className,
}: LinearProgressProps) {
  const { t } = useTranslation()
  // 파라미터 기본값은 훅보다 먼저 평가되므로 기본 문구는 본문에서 정한다.
  const labelResolved = label ?? t('linearProgress.t1')
  const normalized = value === undefined ? undefined : Math.min(100, Math.max(0, value))

  return (
    <div className={cn('grid gap-2', className)}>
      <div className="flex justify-between gap-4 text-sm">
        <span className="font-medium text-[var(--color-text-primary)]">{labelResolved}</span>
        {showValue && normalized !== undefined ? (
          <span className="text-[var(--color-text-secondary)]">{normalized}%</span>
        ) : null}
      </div>
      <div
        aria-label={labelResolved}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={normalized}
        className="h-2 overflow-hidden rounded-full bg-[var(--color-divider)]"
        role="progressbar"
      >
        <span
          className={cn(
            'block h-full rounded-full bg-[var(--color-primary-coral)] transition-[width] duration-200 motion-reduce:transition-none',
            normalized === undefined && 'w-1/3 animate-[pulse_1.5s_ease-in-out_infinite]',
          )}
          style={normalized === undefined ? undefined : { width: `${normalized}%` }}
        />
      </div>
    </div>
  )
}
