import { cn } from '../ui/cn'

export type LinearProgressProps = {
  value?: number
  label?: string
  showValue?: boolean
  className?: string
}

export function LinearProgress({
  value,
  label = '진행률',
  showValue = true,
  className,
}: LinearProgressProps) {
  const normalized = value === undefined ? undefined : Math.min(100, Math.max(0, value))

  return (
    <div className={cn('grid gap-2', className)}>
      <div className="flex justify-between gap-4 text-sm">
        <span className="font-medium text-[var(--color-text-primary)]">{label}</span>
        {showValue && normalized !== undefined ? (
          <span className="text-[var(--color-text-secondary)]">{normalized}%</span>
        ) : null}
      </div>
      <div
        aria-label={label}
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
