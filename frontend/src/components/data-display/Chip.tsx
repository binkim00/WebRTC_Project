import type { HTMLAttributes } from 'react'
import { cn } from '../ui/cn'
import { useTranslation } from '../../i18n'

export type ChipProps = HTMLAttributes<HTMLSpanElement> & {
  selected?: boolean
  disabled?: boolean
  onRemove?: () => void
  removeLabel?: string
}

export function Chip({
  selected,
  disabled,
  onRemove,
  removeLabel,
  className,
  children,
  ...props
}: ChipProps) {
  const { t } = useTranslation()
  // 파라미터 기본값은 훅보다 먼저 평가되므로 기본 문구는 본문에서 정한다.
  const removeLabelResolved = removeLabel ?? t('chip.t1')
  return (
    <span
      aria-disabled={disabled || undefined}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium',
        selected
          ? 'border-violet-300 bg-violet-100 text-violet-800'
          : 'border-slate-300 bg-white text-slate-700',
        disabled && 'opacity-45',
        className,
      )}
      {...props}
    >
      {children}
      {onRemove ? (
        <button
          aria-label={removeLabelResolved}
          className="rounded-full px-1 hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          disabled={disabled}
          onClick={onRemove}
          type="button"
        >
          ×
        </button>
      ) : null}
    </span>
  )
}
