import { Outlet } from 'react-router-dom'
import { TopNavigation } from './components'

const navigationItems = [
  { label: '로그인', to: '/login' },
  { label: '팬', to: '/fan/events' },
  { label: '인플루언서', to: '/influencer/mypage/profile' },
  { label: '매니저', to: '/manager/events' },
] as const

function App() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-[var(--color-surface-page)] text-left text-[var(--color-text-primary)]">
      <TopNavigation
        ariaLabel="주요 화면"
        brand="MELLY"
        items={navigationItems}
      />
      <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
        <Outlet />
      </main>
      <footer className="mt-auto border-t border-[var(--color-divider)] bg-[var(--color-surface-panel)] px-4 py-4 text-center text-sm text-[var(--color-text-secondary)] sm:px-6">
        Notion 화면 라우팅 정의서를 기준으로 구성한 라우팅 학습 화면입니다.
      </footer>
    </div>
  )
}

export default App
