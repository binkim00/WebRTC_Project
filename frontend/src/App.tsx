import { ArrowRightIcon, SignOutIcon } from '@phosphor-icons/react'
import { useEffect } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AUTH_EXPIRED_EVENT, getAuthSession, logout, type LoginRole } from './api/auth'
import { TopNavigation } from './components'
import { getRoleNavigation } from './layouts/roleNavigation'
import { isVideoCallPath } from './router/routeState'

const publicNavigationItems = [
  { label: '로그인', to: '/login' },
] as const

function canAccessRolePath(pathname: string, role: LoginRole) {
  if (/^\/fan(?:\/|$)/.test(pathname)) {
    return role === 'FAN'
  }

  if (/^\/influencer(?:\/|$)/.test(pathname)) {
    return role === 'INFLUENCER' || role === 'SOLO_INFLUENCER'
  }

  if (/^\/manager(?:\/|$)/.test(pathname)) {
    return role === 'MANAGER' || role === 'INFLUENCER' || role === 'SOLO_INFLUENCER'
  }

  if (/^\/fan-meetings\/[^/]+\/(?:fans|statistics)\/?$/.test(pathname)) {
    return role === 'MANAGER' || role === 'INFLUENCER' || role === 'SOLO_INFLUENCER'
  }

  return true
}

function isRolePath(pathname: string) {
  return (
    /^\/(?:fan|influencer|manager)(?:\/|$)/.test(pathname) ||
    /^\/fan-meetings\/[^/]+\/(?:fans|statistics)\/?$/.test(pathname)
  )
}

function isPublicEventPath(pathname: string) {
  return /^\/fan\/events(?:\/[^/]+)?\/?$/.test(pathname)
}

function App() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isCallPage = isVideoCallPath(pathname)
  const isLoginPage = pathname === '/login'
  const isSignupPage = pathname === '/signup'
  const isAuthPage = isLoginPage || isSignupPage
  const isHomePage = pathname === '/'
  const isDeviceCheckPage = /^\/fan-meetings\/[^/]+\/device-check$/.test(pathname)
  const isFanListPage = /^\/influencer\/fan-meetings\/[^/]+\/fans$/.test(pathname)
  const authSession = getAuthSession()
  const isAuthenticated = authSession !== null
  const isQaCapture =
    import.meta.env.DEV &&
    isCallPage &&
    searchParams.get('preview') === '1' &&
    searchParams.get('qa') === '1'
  const isPageQaCapture =
    import.meta.env.DEV && !isCallPage && searchParams.get('qa') === '1'
  const navigationItems = isAuthPage || isDeviceCheckPage
    ? []
    : authSession
      ? getRoleNavigation(authSession.role)
      : isHomePage
        ? []
        : publicNavigationItems

  useEffect(() => {
    const handleAuthExpired = () => navigate('/login', { replace: true })
    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired)
  }, [navigate])

  async function handleLogout() {
    await logout().catch(() => undefined)
    navigate('/', { replace: true })
  }

  if (isRolePath(pathname) && !isPublicEventPath(pathname) && !authSession) {
    return <Navigate replace to="/login" />
  }

  if (authSession && !canAccessRolePath(pathname, authSession.role)) {
    return <Navigate replace to="/403" />
  }

  return (
    <div
      className={[
        'flex min-h-[100dvh] flex-col bg-[var(--color-surface-page)] text-left text-[var(--color-text-primary)]',
        isQaCapture ? 'origin-top-left scale-50' : '',
        isPageQaCapture ? 'w-[1758px]' : '',
      ].join(' ')}
    >
      <TopNavigation
        ariaLabel="주요 화면"
        centerContent={
          isDeviceCheckPage ? (
            <p className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)]">
              <span>입장 예정 팬미팅</span>
              <span aria-hidden="true" className="h-4 w-px bg-[var(--color-divider)]" />
              <strong className="text-[var(--color-text-primary)]">
                서윤의 비밀 정원 팬미팅&nbsp;&nbsp; 오늘 19:00
              </strong>
            </p>
          ) : undefined
        }
        actions={
          isHomePage ? (
            <nav aria-label="메인 메뉴" className="flex items-center gap-7 text-sm font-semibold">
              {isAuthenticated ? (
                <button
                  className="font-semibold hover:text-[var(--color-primary-coral)]"
                  onClick={() => void handleLogout()}
                  type="button"
                >
                  로그아웃
                </button>
              ) : (
                <>
                  <Link className="hover:text-[var(--color-primary-coral)]" to="/fan/events">
                    이벤트
                  </Link>
                  <Link className="hover:text-[var(--color-primary-coral)]" to="/login">
                    로그인
                  </Link>
                </>
              )}
              {!isAuthenticated ? (
                <Link
                  className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-[var(--color-primary-coral)] px-5 text-white shadow-[var(--shadow-final-cta)] transition hover:bg-[var(--color-primary-coral-hover)]"
                  to="/signup"
                >
                  회원가입
                </Link>
              ) : null}
            </nav>
          ) : isDeviceCheckPage ? (
            <Link
              className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              to="/"
            >
              <SignOutIcon aria-hidden="true" size={18} />
              나가기
            </Link>
          ) : isSignupPage ? (
            <p className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              <span>이미 계정이 있나요?</span>
              <Link
                className="inline-flex items-center gap-1 font-bold text-[var(--color-primary-coral)] hover:underline"
                to="/login"
              >
                로그인
                <ArrowRightIcon aria-hidden="true" size={18} weight="bold" />
              </Link>
            </p>
          ) : isLoginPage ? (
            <Link
              className="inline-flex items-center gap-1 text-sm font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-primary-coral)]"
              to="/fan/events"
            >
              이벤트 둘러보기
              <ArrowRightIcon aria-hidden="true" size={18} weight="bold" />
            </Link>
          ) : isAuthenticated ? (
            <button
              className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              onClick={() => void handleLogout()}
              type="button"
            >
              로그아웃
            </button>
          ) : undefined
        }
        brand="MELLY"
        items={navigationItems}
      />
      <main
        className={
          isCallPage
            ? 'mx-auto w-full max-w-[1440px] flex-1 px-3 py-5 sm:px-6 lg:px-10 lg:py-6'
            : isHomePage
              ? 'mx-auto w-full max-w-[1480px] flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:pb-16 lg:pt-10'
            : isDeviceCheckPage
              ? 'mx-auto w-full max-w-[1360px] flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-10'
            : isAuthPage
              ? 'mx-auto flex w-full max-w-[1360px] flex-1 px-4 py-7 sm:px-6 lg:px-10 lg:pb-2 lg:pt-12'
            : 'mx-auto w-full max-w-[1360px] flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-10'
        }
      >
        <Outlet />
      </main>
      {isCallPage || isAuthPage || isHomePage || isDeviceCheckPage || isFanListPage ? null : (
        <footer className="mt-auto border-t border-[var(--color-divider)] bg-[var(--color-surface-panel)] px-4 py-4 text-center text-sm text-[var(--color-text-secondary)] sm:px-6">
          Notion 화면 라우팅 정의서를 기준으로 구성한 라우팅 학습 화면입니다.
        </footer>
      )}
    </div>
  )
}

export default App
