import type { ReactNode } from 'react'
import { cn } from '../ui/cn'

export type StepItem = {
  label: ReactNode
  description?: string
}

export type StepperProps = {
  steps: readonly StepItem[]
  activeStep: number
  className?: string
}

export function Stepper({ steps, activeStep, className }: StepperProps) {
  return (
    <ol className={cn('grid gap-4 text-center sm:grid-flow-col sm:auto-cols-fr', className)}>
      {steps.map((step, index) => {
        const complete = index < activeStep
        const current = index === activeStep
        return (
          <li
            aria-current={current ? 'step' : undefined}
            className="relative flex w-full flex-col items-center gap-3 sm:block"
            key={`${index}-${String(step.label)}`}
          >
            <div className="relative z-10 flex justify-center sm:mb-2">
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold',
                  complete &&
                    'border-[var(--color-success)] bg-[var(--color-success)] text-white shadow-[0_0_0_6px_rgba(34,197,94,0.18),0_0_24px_10px_rgba(34,197,94,0.3)]',
                  current &&
                    'border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] text-white shadow-[0_0_0_6px_rgba(226,93,82,0.2),0_0_26px_11px_rgba(226,93,82,0.34)]',
                  !complete &&
                    !current &&
                    'border-[var(--color-border-control)] bg-[var(--color-surface-page)] text-[var(--color-text-tertiary)] shadow-[0_0_0_5px_rgba(148,163,184,0.12),0_0_18px_7px_rgba(148,163,184,0.2)]',
                )}
              >
                {complete ? '✓' : index + 1}
              </span>
            </div>
            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute left-1/2 top-[18px] hidden h-0.5 w-[calc(100%_-_36px)] translate-x-[18px] sm:block',
                  complete ? 'bg-[var(--color-success-border)]' : 'bg-[var(--color-divider)]',
                )}
              />
            ) : null}
            <div className="text-center">
              <p
                className={cn(
                  'text-sm font-semibold',
                  complete && 'text-[var(--color-success)]',
                  current && 'text-[var(--color-primary-coral-hover)]',
                  !complete && !current && 'text-[var(--color-text-primary)]',
                )}
              >
                {step.label}
              </p>
              {step.description ? (
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{step.description}</p>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
