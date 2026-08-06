import type { HTMLAttributes } from 'react'
import { cn } from '../ui/cn'
import { useTranslation } from '../../i18n'

export type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  lines?: number
}

export function Skeleton({ lines = 1, className, ...props }: SkeletonProps) {
  const { t } = useTranslation()
  return (
    <div
      aria-busy="true"
      aria-label={t('skeleton.t1')}
      className={cn('grid gap-2', className)}
      {...props}
    >
      {Array.from({ length: Math.max(1, lines) }, (_, index) => (
        <span
          className={cn(
            'block h-4 animate-pulse rounded-[var(--radius-control)] bg-[var(--color-divider)]',
            index === lines - 1 && lines > 1 && 'w-2/3',
          )}
          key={index}
        />
      ))}
    </div>
  )
}
