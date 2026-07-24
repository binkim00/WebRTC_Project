import { NavLink, Outlet } from 'react-router-dom'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '../components'

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
  return (
    <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="h-fit">
        <Card>
          <CardHeader>
            <Badge variant="primary">역할 메뉴</Badge>
            <CardTitle as="h2" className="mt-3 text-xl">
              {title}
            </CardTitle>
            <p className="mt-2 text-sm text-slate-500">{description}</p>
          </CardHeader>
          <CardContent>
            <nav aria-label={`${title} 메뉴`} className="grid gap-2">
              {navigation.map((item) => (
                <NavLink
                  className={({ isActive }) =>
                    [
                      'rounded-lg px-3 py-2 text-sm font-medium transition',
                      isActive
                        ? 'bg-violet-100 text-violet-800'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
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
