/**
 * 로그인 응답의 역할이며 백엔드 `UserRole` enum과 같은 값을 쓴다.
 *
 * `ADMIN`은 서비스 운영자다. 팬미팅을 운영하는 역할(MANAGER·SOLO_INFLUENCER)과 달리
 * 서비스 전체 공지 작성·조직 구성원 추가처럼 서비스 단위 권한을 가진다.
 */
export type LoginRole = 'FAN' | 'INFLUENCER' | 'MANAGER' | 'SOLO_INFLUENCER' | 'ADMIN'

export type LoginResponse = {
  accessToken: string
  refreshToken: string
  expiresIn: number
  userId: number
  role: LoginRole
  nickname: string
}

export const AUTH_SESSION_KEY = 'melly-auth-session'
export const AUTH_EXPIRED_EVENT = 'melly-auth-expired'

let memorySession: LoginResponse | null = null

export function isLoginRole(value: unknown): value is LoginRole {
  return (
    value === 'FAN' ||
    value === 'INFLUENCER' ||
    value === 'MANAGER' ||
    value === 'SOLO_INFLUENCER' ||
    value === 'ADMIN'
  )
}

export function isLoginResponse(value: unknown): value is LoginResponse {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const response = value as Record<string, unknown>

  return (
    typeof response.accessToken === 'string' &&
    response.accessToken.trim().length > 0 &&
    typeof response.refreshToken === 'string' &&
    response.refreshToken.trim().length > 0 &&
    typeof response.expiresIn === 'number' &&
    Number.isFinite(response.expiresIn) &&
    response.expiresIn > 0 &&
    typeof response.userId === 'number' &&
    Number.isFinite(response.userId) &&
    isLoginRole(response.role) &&
    typeof response.nickname === 'string'
  )
}

function browserStorage(type: 'localStorage' | 'sessionStorage'): Storage | null {
  if (typeof window === 'undefined') return null

  try {
    return window[type]
  } catch {
    // 저장소가 차단된 브라우저에서도 현재 탭의 메모리 세션은 사용할 수 있게 한다.
    return null
  }
}

function readStoredSession(storage: Storage | null): LoginResponse | null {
  if (!storage) return null

  try {
    const serialized = storage.getItem(AUTH_SESSION_KEY)
    if (!serialized) return null

    const parsed: unknown = JSON.parse(serialized)
    if (isLoginResponse(parsed)) return parsed

    storage.removeItem(AUTH_SESSION_KEY)
    return null
  } catch {
    return null
  }
}

function writeStoredSession(storage: Storage | null, response: LoginResponse) {
  if (!storage) return

  try {
    storage.setItem(AUTH_SESSION_KEY, JSON.stringify(response))
  } catch {
    // 용량 또는 보안 정책으로 저장할 수 없으면 memorySession이 세션을 유지한다.
  }
}

function removeStoredSession(storage: Storage | null) {
  if (!storage) return

  try {
    storage.removeItem(AUTH_SESSION_KEY)
  } catch {
    // 브라우저 저장소 접근 제한은 로그아웃 흐름을 막지 않는다.
  }
}

export function saveAuthSession(response: LoginResponse, remember: boolean) {
  memorySession = response
  writeStoredSession(browserStorage('sessionStorage'), response)
  removeStoredSession(browserStorage('localStorage'))

  // HttpOnly 재발급 쿠키를 지원하기 전까지는 '로그인 유지'를 장기 토큰 저장에 사용하지 않는다.
  void remember
}

export function replaceAuthSession(response: LoginResponse) {
  saveAuthSession(response, false)
}

export function getAuthSession(): LoginResponse | null {
  const sessionStorage = browserStorage('sessionStorage')
  const localStorage = browserStorage('localStorage')
  const storedSession = readStoredSession(sessionStorage)
  const legacySession = readStoredSession(localStorage)

  // 이전 버전의 장기 저장 토큰은 현재 탭 저장소로 한 번만 옮긴 뒤 즉시 삭제한다.
  removeStoredSession(localStorage)
  const session = storedSession ?? legacySession ?? memorySession
  if (session && !storedSession) writeStoredSession(sessionStorage, session)
  memorySession = session
  return session
}

export function clearAuthSession() {
  memorySession = null
  removeStoredSession(browserStorage('localStorage'))
  removeStoredSession(browserStorage('sessionStorage'))
}
