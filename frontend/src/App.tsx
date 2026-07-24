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
    <div className="flex min-h-screen flex-col bg-slate-50 text-left text-slate-900">
      <TopNavigation
        ariaLabel="주요 화면"
        brand="MELLY"
        items={navigationItems}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <Outlet />
      </main>
      <footer className="mt-auto border-t border-slate-200 bg-white px-6 py-4 text-center text-sm text-slate-500">
        Notion 화면 라우팅 정의서를 기준으로 구성한 라우팅 학습 화면입니다.
      </footer>
    </div>
  )
}

export default App
