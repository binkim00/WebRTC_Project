import { ArrowRightIcon, SignOutIcon, UserCircle } from '@phosphor-icons/react'
import { useEffect, useRef } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AUTH_EXPIRED_EVENT,
  getAuthSession,
  logout,
  type LoginResponse,
  type LoginRole,
} from './api/auth'
import { purgeExpiredFanCardData } from './api/capturedPhotos'
import { AppHeader } from './components'
import {
  canRoleAccessPath,
  requiredCapabilityForPath,
} from './router/roleCapabilities'
import { isVideoCallPath } from './router/routeState'

const publicNavigationItems = [
  { label: '공지사항', to: '/service-notices' },
  { label: '로그인', to: '/login' },
] as const

/** 주소만으로도 스크린리더와 브라우저 탭이 현재 화면을 구분할 수 있게 제목을 만든다. */
function pageTitleForPath(pathname: string): string {
  if (pathname === '/') return 'MELLY'
  if (pathname === '/login') return '로그인 | MELLY'
  if (pathname === '/signup') return '회원가입 | MELLY'
  if (pathname.startsWith('/manager/fan-meetings')) return '팬미팅 운영 | MELLY'
  if (pathname.startsWith('/influencer/fan-meetings')) return '팬미팅 진행 | MELLY'
  if (pathname.startsWith('/fan/events')) return '팬미팅 이벤트 | MELLY'
  if (/^\/fan\/fan-meetings\/[^/]+\/cards\//.test(pathname)) return '기념 카드 | MELLY'
  if (pathname.startsWith('/fan/')) return '팬 마이페이지 | MELLY'
  if (pathname.startsWith('/notifications')) return '알림 | MELLY'
  if (pathname.startsWith('/service-notices')) return '공지사항 | MELLY'
  return 'MELLY'
}

function isRolePath(pathname: string) {
  // 로그인 필요 여부와 역할 권한 검사가 같은 URL-기능 매핑을 공유한다.
  return requiredCapabilityForPath(pathname) !== undefined
}

/**
 * 로그인 여부와 역할을 모두 가리지 않는 공개 탐색 경로다.
 *
 * 백엔드가 permitAll로 열어 둔 조회 API만 쓰는 화면이라 비로그인도 볼 수 있어야 하고,
 * 운영자·인플루언서도 팬에게 보이는 화면을 그대로 확인할 수 있어야 한다.
 * `/fan` 접두사를 쓰지만 팬 전용이 아니므로 역할 검사에서도 제외한다.
 *
 * 개인화된 하위 경로(예: `/fan/events/{id}/application-result`)는 세그먼트가 하나 더 있어
 * 여기에 걸리지 않고 팬 전용으로 남는다.
 */
function isPublicBrowsePath(pathname: string) {
  return (
    /^\/fan\/events(?:\/[^/]+)?\/?$/.test(pathname) ||
    /^\/fan\/influencers(?:\/[^/]+)?\/?$/.test(pathname)
  )
}

/** 역할은 가리지 않지만 로그인은 필요한 경로다. 비로그인으로 열면 API가 401만 돌려준다. */
function isAuthenticatedOnlyPath(pathname: string) {
  return (
    /^\/notifications\/?$/.test(pathname) ||
    // 장비 권한을 요청하고 점검 결과를 저장하는 화면은 공개 탐색 화면이 아니므로 로그인부터 확인한다.
    /^\/fan-meetings\/[^/]+\/device-check\/?$/.test(pathname)
  )
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
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const previousPathRef = useRef(pathname)
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
  const returnTo = `${pathname}${search}`
  const loginPath = `/login?redirect=${encodeURIComponent(returnTo)}`
  const isQaCapture =
    import.meta.env.DEV &&
    isCallPage &&
    searchParams.get('preview') === '1' &&
    searchParams.get('qa') === '1'
  const isPageQaCapture =
    import.meta.env.DEV && !isCallPage && searchParams.get('qa') === '1'
  const navigationItems = isAuthPage || isDeviceCheckPage
    ? []
    : isHomePage
      ? []
      : publicNavigationItems.map((item) =>
          item.to === '/login' ? { ...item, to: loginPath } : item,
        )
  const roleHeaderRole =
    authSession && !isAuthPage && !isDeviceCheckPage
      ? authSession.role
      : undefined
  const headerNavigationProps = roleHeaderRole
    ? ({ role: roleHeaderRole } as const)
    : ({ items: navigationItems } as const)

  useEffect(() => {
    // 통화 사진은 브라우저에만 두므로 정해진 시각에 저절로 지워지지 않는다. 앱에 들어올
    // 때 한 번 훑어, 보관 기간이 지난 사진과 꾸미던 내용이 기기에 오래 남지 않게 한다.
    void purgeExpiredFanCardData(Date.now()).catch(() => undefined)
  }, [])

  useEffect(() => {
    const handleAuthExpired = () => {
      navigate(`/login?redirect=${encodeURIComponent(`${pathname}${search}`)}`, {
        replace: true,
      })
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired)
  }, [navigate, pathname, search])

  useEffect(() => {
    document.title = pageTitleForPath(pathname)

    // 클라이언트 라우팅 뒤에는 새 화면의 본문 시작점을 알려 키보드·스크린리더 사용자가 헤매지 않게 한다.
    if (previousPathRef.current !== pathname) {
      window.requestAnimationFrame(() => {
        document.getElementById('main-content')?.focus({ preventScroll: true })
      })
      previousPathRef.current = pathname
    }
  }, [pathname])

  async function handleLogout() {
    await logout().catch(() => undefined)
    navigate('/', { replace: true })
  }

  // 공개 탐색 경로는 로그인·역할 검사를 모두 건너뛴다.
  const isPublicBrowse = isPublicBrowsePath(pathname)
  const needsLogin =
    !isPublicBrowse && (isRolePath(pathname) || isAuthenticatedOnlyPath(pathname))

  if (needsLogin && !authSession) {
    return <Navigate replace to={loginPath} />
  }

  // 역할 이름만 비교하지 않고 기능 권한으로 검사해 솔로 계정의 조직 관리 접근을 막는다.
  if (!isPublicBrowse && authSession && !canRoleAccessPath(pathname, authSession.role)) {
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
      {isEditorialExamplePage ? null : <AppHeader
        {...headerNavigationProps}
        // 통화 중에는 알림으로 이탈하지 않도록 벨을 숨긴다. (handoff 7b)
        hideNotifications={isCallPage}
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
                  <Link className="hover:text-[var(--color-primary-coral)]" to={loginPath}>
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
      />}
      {/* 스킵 링크와 라우트 전환 후 포커스 이동이 도착할 수 있는 공통 본문 앵커다. */}
      <main
        id="main-content"
        tabIndex={-1}
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
