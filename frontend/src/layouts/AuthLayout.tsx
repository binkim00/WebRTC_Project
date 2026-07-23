import { Outlet } from 'react-router-dom'

export function AuthLayout() {
  return (
    <div className="mx-auto max-w-2xl">
      <Outlet />
    </div>
  )
}
