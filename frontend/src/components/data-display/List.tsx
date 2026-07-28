import type { HTMLAttributes } from 'react'
import { cn } from '../ui/cn'

export function List({ className, ...props }: HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn('divide-y divide-slate-200', className)} {...props} />
}

export function ListItem({ className, ...props }: HTMLAttributes<HTMLLIElement>) {
  return <li className={cn('px-4 py-3', className)} {...props} />
}
