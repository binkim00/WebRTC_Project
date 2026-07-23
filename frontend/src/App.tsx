import { Link, Outlet } from 'react-router-dom'

function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-left text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link className="text-xl font-bold tracking-tight text-violet-700" to="/">
            MELLY
          </Link>
          <nav aria-label="주요 화면" className="flex flex-wrap gap-2 text-sm">
            <Link className="rounded-md px-3 py-2 hover:bg-slate-100" to="/login">
              로그인
            </Link>
            <Link className="rounded-md px-3 py-2 hover:bg-slate-100" to="/fan/events">
              팬
            </Link>
            <Link
              className="rounded-md px-3 py-2 hover:bg-slate-100"
              to="/influencer/mypage/profile"
            >
              인플루언서
            </Link>
            <Link className="rounded-md px-3 py-2 hover:bg-slate-100" to="/manager/events">
              매니저
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-8">
        <Outlet />
      </main>
      <footer className="mt-auto border-t border-slate-200 bg-white px-6 py-4 text-center text-sm text-slate-500">
        Notion 화면 라우팅 정의서를 기준으로 구성한 라우팅 학습 화면입니다.
      </footer>
    </div>
  )
}

export default App
