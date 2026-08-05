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
        'border-0 border-t bg-transparent',
        selected
          ? 'border-[var(--color-primary-coral)]'
          : 'border-[var(--color-divider)]',
        interactive &&
          'transition-colors duration-200 hover:border-[var(--color-primary-coral)] motion-reduce:transition-none',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('p-5 sm:p-6', className)}
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
