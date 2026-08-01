import type { ReactNode } from 'react'
import { cn } from '../ui/cn'
import { AlertBanner, type FeedbackVariant } from './AlertBanner'

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
      className={cn(
        'fixed bottom-5 right-5 z-50 grid w-[min(24rem,calc(100vw-2.5rem))] gap-2',
        className,
      )}
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
