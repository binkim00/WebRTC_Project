import type { ReactNode } from 'react'
import { cn } from '../ui/cn'
import { AlertBanner, type FeedbackVariant } from './AlertBanner'
import { useTranslation } from '../../i18n'

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
  label,
  className,
}: ToastRegionProps) {
  const { t } = useTranslation()
  // 파라미터 기본값은 훅보다 먼저 평가되므로 기본 문구는 본문에서 정한다.
  const resolvedLabel = label ?? t('toastRegion.t1')
  return (
    <section
      aria-label={resolvedLabel}
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
