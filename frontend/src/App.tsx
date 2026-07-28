import { Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { TopNavigation } from './components'
import { isVideoCallPath } from './router/routeState'

const defaultNavigationItems = [
  { label: '로그인', to: '/login' },
  { label: '팬', to: '/fan/events' },
  { label: '인플루언서', to: '/influencer/mypage/profile' },
  { label: '매니저', to: '/manager/events' },
] as const

const fanCallNavigationItems = [
  { label: '이벤트', to: '/fan/events' },
  { label: '마이페이지', to: '/fan/mypage/profile' },
] as const

const influencerCallNavigationItems = [
  { label: '팬미팅', to: '/influencer/mypage/fan-meetings' },
  { label: '마이페이지', to: '/influencer/mypage/profile' },
] as const

function App() {
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const isCallPage = isVideoCallPath(pathname)
  const isQaCapture =
    import.meta.env.DEV &&
    isCallPage &&
    searchParams.get('preview') === '1' &&
    searchParams.get('qa') === '1'
  const navigationItems = pathname.startsWith('/fan/fan-meetings/')
    ? fanCallNavigationItems
    : pathname.startsWith('/influencer/fan-meetings/')
      ? influencerCallNavigationItems
      : defaultNavigationItems

  return (
    <div
      className={[
        'flex min-h-[100dvh] flex-col bg-[var(--color-surface-page)] text-left text-[var(--color-text-primary)]',
        isQaCapture ? 'origin-top-left scale-50' : '',
      ].join(' ')}
    >
      <TopNavigation
        ariaLabel="주요 화면"
        brand="MELLY"
        items={navigationItems}
      />
      <main
        className={
          isCallPage
            ? 'mx-auto w-full max-w-[1440px] flex-1 px-3 py-5 sm:px-6 lg:px-10 lg:py-6'
            : 'mx-auto w-full max-w-[1360px] flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-10'
        }
      >
        <Outlet />
      </main>
      {isCallPage ? null : (
        <footer className="mt-auto border-t border-[var(--color-divider)] bg-[var(--color-surface-panel)] px-4 py-4 text-center text-sm text-[var(--color-text-secondary)] sm:px-6">
          Notion 화면 라우팅 정의서를 기준으로 구성한 라우팅 학습 화면입니다.
        </footer>
      )}
    </div>
  )
}

export default App
