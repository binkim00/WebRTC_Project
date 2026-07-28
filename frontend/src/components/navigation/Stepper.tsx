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
    <ol className={cn('grid gap-4 sm:grid-flow-col sm:auto-cols-fr', className)}>
      {steps.map((step, index) => {
        const complete = index < activeStep
        const current = index === activeStep
        return (
          <li
            aria-current={current ? 'step' : undefined}
            className="relative flex gap-3 sm:block"
            key={`${index}-${String(step.label)}`}
          >
            <div className="flex items-center sm:mb-2">
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold',
                  complete && 'border-[var(--color-success)] bg-[var(--color-success)] text-white',
                  current &&
                    'border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] text-white shadow-[0_0_0_5px_var(--color-primary-coral-soft)]',
                  !complete &&
                    !current &&
                    'border-[var(--color-border-control)] bg-[var(--color-surface-page)] text-[var(--color-text-tertiary)]',
                )}
              >
                {complete ? '✓' : index + 1}
              </span>
              {index < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'ml-2 hidden h-0.5 flex-1 sm:block',
                    complete ? 'bg-[var(--color-success-border)]' : 'bg-[var(--color-divider)]',
                  )}
                />
              ) : null}
            </div>
            <div>
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
