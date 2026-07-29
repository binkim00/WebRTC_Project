import type { HTMLAttributes } from 'react'
import { cn } from '../ui/cn'

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean
  selected?: boolean
}

export function Card({ interactive, selected, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-panel)] border bg-[var(--color-surface-panel)]',
        selected
          ? 'border-[var(--color-primary-coral)] shadow-[0_0_0_3px_var(--color-primary-coral-soft-border)]'
          : 'border-[var(--color-border-panel)] shadow-[var(--shadow-panel)]',
        interactive &&
          'transition-[border-color,box-shadow] duration-200 hover:border-[var(--color-primary-coral-soft-border)] motion-reduce:transition-none',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('border-b border-[var(--color-divider)] p-5 sm:p-6', className)}
      {...props}
    />
  )
}

export type CardTitleProps = HTMLAttributes<HTMLHeadingElement> & {
  as?: 'h1' | 'h2' | 'h3' | 'h4'
}

export function CardTitle({ as: Heading = 'h3', className, ...props }: CardTitleProps) {
  return (
    <Heading
      className={cn('text-lg font-bold text-[var(--color-text-primary)]', className)}
      {...props}
    />
  )
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 sm:p-6', className)} {...props} />
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('border-t border-[var(--color-divider)] p-5 sm:p-6', className)}
      {...props}
    />
  )
}
