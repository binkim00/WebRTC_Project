import type { HTMLAttributes, ReactNode } from 'react'
import { IconButton } from '../ui/Button'
import { cn } from '../ui/cn'

export type FeedbackVariant = 'success' | 'info' | 'warning' | 'error'

const feedbackClasses: Record<FeedbackVariant, string> = {
  success:
    'border-[var(--color-success-border)] bg-[var(--color-success-soft)] text-[var(--color-success)]',
  info:
    'border-[var(--color-primary-coral-soft-border)] bg-[var(--color-primary-coral-soft)] text-[var(--color-primary-coral-hover)]',
  warning:
    'border-[var(--color-warning-border)] bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
  error:
    'border-[var(--color-error-border)] bg-[var(--color-error-soft)] text-[var(--color-error)]',
}

const feedbackIcons: Record<FeedbackVariant, string> = {
  success: '✓',
  info: 'i',
  warning: '!',
  error: '×',
}

export type AlertBannerProps = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  variant?: FeedbackVariant
  title?: ReactNode
  dismissLabel?: string
  onDismiss?: () => void
}

export function AlertBanner({
  variant = 'info',
  title,
  dismissLabel = '알림 닫기',
  onDismiss,
  children,
  className,
  ...props
}: AlertBannerProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-[var(--radius-panel)] border p-4',
        feedbackClasses[variant],
        className,
      )}
      role={variant === 'error' ? 'alert' : 'status'}
      {...props}
    >
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full border border-current text-xs font-bold"
      >
        {feedbackIcons[variant]}
      </span>
      <div className="min-w-0 flex-1">
        {title ? <p className="font-bold">{title}</p> : null}
        <div className={cn('text-sm', Boolean(title) && 'mt-1')}>{children}</div>
      </div>
      {onDismiss ? (
        <IconButton
          aria-label={dismissLabel}
          className="-m-2"
          icon="×"
          onClick={onDismiss}
          size="sm"
          variant="ghost"
        />
      ) : null}
    </div>
  )
}
