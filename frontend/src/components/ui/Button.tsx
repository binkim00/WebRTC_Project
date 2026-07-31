import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'border-transparent bg-[var(--color-primary-coral)] text-white hover:bg-[var(--color-primary-coral-hover)] active:bg-[var(--color-primary-coral-active)]',
  secondary:
    'border-[var(--color-border-control)] bg-[var(--color-surface-panel)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-page)] active:bg-[var(--color-divider)]',
  outline:
    'border-[var(--color-primary-coral)] bg-transparent text-[var(--color-primary-coral)] hover:bg-[var(--color-primary-coral-soft)] active:bg-[var(--color-primary-coral-soft-border)]',
  ghost:
    'border-transparent bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-page)] hover:text-[var(--color-text-primary)] active:bg-[var(--color-divider)]',
  danger:
    'border-transparent bg-[var(--color-error)] text-white hover:bg-[var(--color-error-hover)] active:bg-[var(--color-error-active)]',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 py-1.5 text-sm',
  md: 'min-h-[var(--control-height)] px-[var(--control-padding-inline)] py-2 text-sm',
  lg: 'min-h-[var(--control-height-final-cta)] px-6 py-2.5 text-base',
}

function buttonClassName({
  variant = 'primary',
  size = 'md',
  className,
}: Pick<ButtonProps, 'variant' | 'size' | 'className'> = {}) {
  return cn(
    'inline-flex items-center justify-center gap-[var(--space-control-gap)] whitespace-nowrap rounded-[var(--radius-control)] border font-semibold',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out',
    'active:translate-y-px motion-reduce:transform-none motion-reduce:transition-none',
    'focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]',
    'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45',
    variantClasses[variant],
    sizeClasses[size],
    className,
  )
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  leadingIcon,
  trailingIcon,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      aria-busy={loading || undefined}
      className={buttonClassName({ variant, size, className })}
      disabled={disabled || loading}
      type={type}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      ) : (
        leadingIcon
      )}
      <span>{children}</span>
      {loading ? null : trailingIcon}
    </button>
  )
}

export type IconButtonProps = Omit<ButtonProps, 'children' | 'leadingIcon' | 'trailingIcon'> & {
  'aria-label': string
  icon: ReactNode
}

export function IconButton({
  icon,
  size = 'md',
  variant = 'ghost',
  className,
  ...props
}: IconButtonProps) {
  return (
    <Button
      className={cn('aspect-square p-0', className)}
      size={size}
      variant={variant}
      {...props}
    >
      <span aria-hidden="true">{icon}</span>
    </Button>
  )
}
