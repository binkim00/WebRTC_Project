import { Outlet } from 'react-router-dom'

export function AuthLayout() {
  return (
    <div className="w-full">
      <Outlet />
    </div>
  )
}
