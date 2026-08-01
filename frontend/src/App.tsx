import { ArrowRightIcon, SignOutIcon, UserCircle } from '@phosphor-icons/react'
import { useEffect } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AUTH_EXPIRED_EVENT,
  getAuthSession,
  logout,
  type LoginResponse,
  type LoginRole,
} from './api/auth'
import { TopNavigation } from './components'
import { getRoleNavigation } from './layouts/roleNavigation'
import { isVideoCallPath } from './router/routeState'

const publicNavigationItems = [
  { label: '공지사항', to: '/service-notices' },
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
    return role === 'MANAGER' || role === 'SOLO_INFLUENCER'
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

function roleLabel(role: LoginRole) {
  if (role === 'FAN') return '팬'
  if (role === 'INFLUENCER') return '인플루언서'
  if (role === 'SOLO_INFLUENCER') return '솔로 인플루언서'
  return '매니저'
}

/** 역할별 프로필(마이페이지) 경로를 돌려준다. */
function profilePathFor(role: LoginRole) {
  if (role === 'FAN') return '/fan/mypage/profile'
  if (role === 'INFLUENCER' || role === 'SOLO_INFLUENCER') {
    return '/influencer/mypage/profile'
  }
  return '/manager/mypage'
}

/** 상단 우측의 로그인 사용자 요약. 클릭하면 역할에 맞는 프로필 페이지로 이동한다. */
function UserProfileSummary({ session }: { session: LoginResponse }) {
  return (
    <Link
      className="inline-flex items-center gap-2 text-left transition-colors hover:text-[var(--color-primary-coral)]"
      to={profilePathFor(session.role)}
    >
      <UserCircle
        aria-hidden="true"
        className="text-[var(--color-text-tertiary)]"
        size={28}
        weight="duotone"
      />
      <span className="grid leading-tight">
        <strong className="max-w-28 truncate text-sm text-[var(--color-text-primary)]">
          {session.nickname || '회원'}
        </strong>
        <span className="text-xs font-medium text-[var(--color-text-tertiary)]">
          {roleLabel(session.role)}
        </span>
      </span>
    </Link>
  )
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
  const isEditorialExamplePage = pathname === '/examples/yestalgia-home'
  const isDeviceCheckPage =
    /^\/fan-meetings\/[^/]+\/device-check$/.test(pathname) ||
    /^\/influencer\/fan-meetings\/[^/]+\/device-check$/.test(pathname)
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
      {isEditorialExamplePage ? null : <TopNavigation
        ariaLabel="주요 화면"
        centerContent={
          isDeviceCheckPage ? (
            <p className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)]">
              <span>입장 예정 팬미팅</span>
              <span aria-hidden="true" className="h-4 w-px bg-[var(--color-divider)]" />
              <strong className="text-[var(--color-text-primary)]">
                선택한 팬미팅 장비 점검
              </strong>
            </p>
          ) : undefined
        }
        actions={
          isHomePage ? (
            <nav aria-label="메인 메뉴" className="flex items-center gap-7 text-sm font-semibold">
              {authSession ? (
                <>
                  <UserProfileSummary session={authSession} />
                  <button
                    className="font-semibold hover:text-[var(--color-primary-coral)]"
                    onClick={() => void handleLogout()}
                    type="button"
                  >
                    로그아웃
                  </button>
                </>
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
          ) : authSession ? (
            <div className="flex items-center gap-5">
              <UserProfileSummary session={authSession} />
              <button
                className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                onClick={() => void handleLogout()}
                type="button"
              >
                로그아웃
              </button>
            </div>
          ) : undefined
        }
        brand="MELLY"
        items={navigationItems}
      />}
      <main
        className={
          isCallPage
            ? 'mx-auto w-full max-w-[1440px] flex-1 px-3 py-5 sm:px-6 lg:px-10 lg:py-6'
            : isHomePage
              ? 'mx-auto w-full max-w-[1480px] flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:pb-16 lg:pt-10'
            : isEditorialExamplePage
              ? 'w-full flex-1'
            : isDeviceCheckPage
              ? 'mx-auto w-full max-w-[1360px] flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-10'
            : isAuthPage
              ? 'mx-auto flex w-full max-w-[1360px] flex-1 px-4 py-7 sm:px-6 lg:px-10 lg:pb-2 lg:pt-12'
            : 'mx-auto w-full max-w-[1360px] flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-10'
        }
      >
        <Outlet />
      </main>
    </div>
  )
}

export default App
