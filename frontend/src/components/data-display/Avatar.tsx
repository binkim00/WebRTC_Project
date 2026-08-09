import { cn } from '../ui/cn'

export type AvatarProps = {
  name: string
  src?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const avatarSizeClasses = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-base',
} as const

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const fallback = name.trim().slice(0, 2).toUpperCase()

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-violet-100 font-bold text-violet-800',
        avatarSizeClasses[size],
        className,
      )}
    >
      {src ? <img alt={name} className="size-full object-cover" decoding="async" loading="lazy" src={src} /> : fallback}
    </span>
  )
}
