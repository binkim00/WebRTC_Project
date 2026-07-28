import {
  useEffect,
  useId,
  useRef,
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react'
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
  error: 'border-[var(--color-error-border)] bg-[var(--color-error-soft)] text-[var(--color-error)]',
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

export type ToastItem = {
  id: string
  message: ReactNode
  title?: ReactNode
  variant?: FeedbackVariant
}

export type ToastRegionProps = {
  toasts: readonly ToastItem[]
  onDismiss?: (id: string) => void
  label?: string
  className?: string
}

export function ToastRegion({
  toasts,
  onDismiss,
  label = '알림 메시지',
  className,
}: ToastRegionProps) {
  return (
    <section
      aria-label={label}
      className={cn('fixed bottom-5 right-5 z-50 grid w-[min(24rem,calc(100vw-2.5rem))] gap-2', className)}
    >
      {toasts.map((toast) => (
        <AlertBanner
          className="shadow-[var(--shadow-modal)]"
          key={toast.id}
          onDismiss={onDismiss ? () => onDismiss(toast.id) : undefined}
          title={toast.title}
          variant={toast.variant}
        >
          {toast.message}
        </AlertBanner>
      ))}
    </section>
  )
}

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

export type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  lines?: number
}

export function Skeleton({ lines = 1, className, ...props }: SkeletonProps) {
  return (
    <div aria-busy="true" aria-label="콘텐츠 불러오는 중" className={cn('grid gap-2', className)} {...props}>
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

export type DialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  closeLabel?: string
  className?: string
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  closeLabel = '팝업 닫기',
  className,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) {
      return
    }

    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault()
    onOpenChange(false)
  }

  function handleBackdropClick(event: ReactMouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      onOpenChange(false)
    }
  }

  return (
    <dialog
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      className={cn(
        'm-auto w-[min(32rem,calc(100vw-2rem))] rounded-[var(--radius-panel)] border border-[var(--color-border-panel)] bg-[var(--color-surface-panel)] p-0 text-[var(--color-text-primary)] shadow-[var(--shadow-modal)]',
        'backdrop:bg-[rgb(23_24_29/48%)]',
        className,
      )}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      onClose={() => onOpenChange(false)}
      ref={dialogRef}
    >
      <div className="flex items-start justify-between gap-4 border-b border-[var(--color-divider)] p-5 sm:p-6">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text-primary)]" id={titleId}>
            {title}
          </h2>
          {description ? (
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]" id={descriptionId}>
              {description}
            </p>
          ) : null}
        </div>
        <IconButton aria-label={closeLabel} icon="×" onClick={() => onOpenChange(false)} size="sm" />
      </div>
      {children ? <div className="p-5 sm:p-6">{children}</div> : null}
      {footer ? (
        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--color-divider)] p-5 sm:p-6">
          {footer}
        </div>
      ) : null}
    </dialog>
  )
}
