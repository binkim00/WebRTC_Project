import { cn } from '../ui/cn'

export type MeterProps = {
  value: number
  min?: number
  max?: number
  low?: number
  high?: number
  optimum?: number
  label: string
  unit?: string
  className?: string
}

export function Meter({
  value,
  min = 0,
  max = 100,
  low,
  high,
  optimum,
  label,
  unit = '%',
  className,
}: MeterProps) {
  return (
    <div className={cn('grid gap-2', className)}>
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="font-medium text-[var(--color-text-primary)]">{label}</span>
        <span className="text-[var(--color-text-secondary)]">
          {value}
          {unit}
        </span>
      </div>
      <meter
        className="h-3 w-full accent-[var(--color-success)]"
        high={high}
        low={low}
        max={max}
        min={min}
        optimum={optimum}
        value={value}
      >
        {value}
        {unit}
      </meter>
    </div>
  )
}
