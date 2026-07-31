export type LoginRole = 'FAN' | 'INFLUENCER' | 'MANAGER' | 'SOLO_INFLUENCER'

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

export function isLoginRole(value: unknown): value is LoginRole {
  return (
    value === 'FAN' ||
    value === 'INFLUENCER' ||
    value === 'MANAGER' ||
    value === 'SOLO_INFLUENCER'
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

function getSessionStorage(): Storage | null {
  if (window.localStorage.getItem(AUTH_SESSION_KEY)) return window.localStorage
  if (window.sessionStorage.getItem(AUTH_SESSION_KEY)) return window.sessionStorage
  return null
}

export function saveAuthSession(response: LoginResponse, remember: boolean) {
  const selectedStorage = remember ? window.localStorage : window.sessionStorage
  const unusedStorage = remember ? window.sessionStorage : window.localStorage

  unusedStorage.removeItem(AUTH_SESSION_KEY)
  selectedStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(response))
}

export function replaceAuthSession(response: LoginResponse) {
  const selectedStorage = getSessionStorage() ?? window.sessionStorage
  selectedStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(response))
}

export function getAuthSession(): LoginResponse | null {
  const serialized =
    window.localStorage.getItem(AUTH_SESSION_KEY) ?? window.sessionStorage.getItem(AUTH_SESSION_KEY)

  if (!serialized) return null

  try {
    const parsed: unknown = JSON.parse(serialized)
    return isLoginResponse(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function clearAuthSession() {
  window.localStorage.removeItem(AUTH_SESSION_KEY)
  window.sessionStorage.removeItem(AUTH_SESSION_KEY)
}
