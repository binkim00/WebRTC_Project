import {
  useEffect,
  useId,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react'
import { IconButton } from '../ui/Button'
import { cn } from '../ui/cn'
import { useTranslation } from '../../i18n'

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
  closeLabel,
  className,
}: DialogProps) {
  const { t } = useTranslation()
  // 파라미터 기본값은 훅보다 먼저 평가되므로 기본 문구는 본문에서 정한다.
  const closeLabelResolved = closeLabel ?? t('dialog.t1')
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
        'mj-dialog m-auto w-[min(32rem,calc(100vw-2rem))] rounded-[var(--radius-panel)] border border-[var(--color-border-panel)] bg-[var(--color-surface-panel)] p-0 text-[var(--color-text-primary)] shadow-[var(--shadow-modal)]',
        className,
      )}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      onClose={() => onOpenChange(false)}
      ref={dialogRef}
    >
      <div className="flex items-start justify-between gap-4 border-b border-[var(--color-divider)] p-5 sm:p-6">
        <div>
          <h2
            className="mj-font-emphasis text-xl text-[var(--color-text-primary)]"
            id={titleId}
          >
            {title}
          </h2>
          {description ? (
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]" id={descriptionId}>
              {description}
            </p>
          ) : null}
        </div>
        <IconButton
          aria-label={closeLabelResolved}
          icon="×"
          onClick={() => onOpenChange(false)}
          size="sm"
        />
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
