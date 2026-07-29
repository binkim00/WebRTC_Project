import type { ReactNode } from 'react'
import { cn } from '../ui/cn'

export type EmptyStateProps = {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-dashed border-slate-300 p-8 text-center',
        className,
      )}
    >
      {icon ? <div className="mx-auto mb-4 text-4xl text-slate-400">{icon}</div> : null}
      <h3 className="text-lg font-bold text-slate-950">{title}</h3>
      {description ? (
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  )
}
