import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '../components'
import { isVideoCallPath } from '../router/routeState'

export type RoleNavigationItem = {
  label: string
  to: string
}

type RoleLayoutProps = {
  title: string
  description: string
  navigation: readonly RoleNavigationItem[]
}

export function RoleLayout({ title, description, navigation }: RoleLayoutProps) {
  const { pathname } = useLocation()
  const isManagerPage = pathname.startsWith('/manager')

  if (isVideoCallPath(pathname) || isManagerPage) {
    return <Outlet />
  }

  return (
    <div className="grid items-start gap-[var(--space-panel-gap)] lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="h-fit lg:sticky lg:top-[calc(var(--service-header-height)+24px)]">
        <Card className="overflow-hidden">
          <CardHeader>
            <Badge variant="primary">역할 메뉴</Badge>
            <CardTitle as="h2" className="mt-3 text-xl tracking-[-0.025em]">
              {title}
            </CardTitle>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
              {description}
            </p>
          </CardHeader>
          <CardContent className="p-2 sm:p-2">
            <nav aria-label={`${title} 메뉴`} className="grid gap-2">
              {navigation.map((item) => (
                <NavLink
                  className={({ isActive }) =>
                    [
                      'inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-transparent px-3 py-2 text-sm font-semibold',
                      'transition-colors duration-200 motion-reduce:transition-none',
                      isActive
                        ? 'border-[var(--color-primary-coral-soft-border)] bg-[var(--color-primary-coral-soft)] text-[var(--color-primary-coral-hover)]'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-page)] hover:text-[var(--color-text-primary)]',
                    ].join(' ')
                  }
                  key={`${item.to}-${item.label}`}
                  to={item.to}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </CardContent>
        </Card>
      </aside>
      <section className="min-w-0">
        <Outlet />
      </section>
    </div>
  )
}
