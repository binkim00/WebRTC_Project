import { ApiError } from './ApiError'

const API_URL = import.meta.env.VITE_API_BASE_URL ?? ''
const AUTH_SESSION_KEY = 'melly-auth-session'
const AUTH_SAVED_AT_KEY = 'melly-auth-saved-at'

type ErrorResponse = {
  code?: string
  message?: string
  detail?: string
}

export type ApiRequestOptions = RequestInit & {
  authToken?: string
}

function getStoredAccessToken(): string | undefined {
  const storage = window.localStorage.getItem(AUTH_SESSION_KEY)
    ? window.localStorage
    : window.sessionStorage
  const serialized = storage.getItem(AUTH_SESSION_KEY)

  if (!serialized) return undefined

  try {
    const session: unknown = JSON.parse(serialized)
    if (typeof session !== 'object' || session === null) return undefined
    const record = session as Record<string, unknown>
    const accessToken = record.accessToken
    const expiresIn = record.expiresIn
    const savedAt = Number(storage.getItem(AUTH_SAVED_AT_KEY))
    if (
      typeof expiresIn !== 'number' ||
      !Number.isFinite(savedAt) ||
      Date.now() >= savedAt + expiresIn * 1000
    ) {
      window.localStorage.removeItem(AUTH_SESSION_KEY)
      window.sessionStorage.removeItem(AUTH_SESSION_KEY)
      window.localStorage.removeItem(AUTH_SAVED_AT_KEY)
      window.sessionStorage.removeItem(AUTH_SAVED_AT_KEY)
      return undefined
    }
    return typeof accessToken === 'string' && accessToken.trim() ? accessToken : undefined
  } catch {
    return undefined
  }
}

async function readErrorResponse(response: Response): Promise<ErrorResponse> {
  const text = await response.text()

  if (!text) {
    return {}
  }

  try {
    const data: unknown = JSON.parse(text)

    if (typeof data !== 'object' || data === null) {
      return {}
    }

    const error = data as Record<string, unknown>

    return {
      code: typeof error.code === 'string' ? error.code : undefined,
      message: typeof error.message === 'string' ? error.message : undefined,
      detail: typeof error.detail === 'string' ? error.detail : undefined,
    }
  } catch {
    return {}
  }
}

export async function apiRequest<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { authToken, ...requestOptions } = options
  const resolvedAuthToken = authToken ?? getStoredAccessToken()

  const response = await fetch(`${API_URL}${path}`, {
    ...requestOptions,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(resolvedAuthToken ? { Authorization: `Bearer ${resolvedAuthToken}` } : {}),
      ...requestOptions.headers,
    },
  })

  if (!response.ok) {
    const error = await readErrorResponse(response)
    if (response.status === 401 && path !== '/api/v1/auth/login') {
      window.localStorage.removeItem(AUTH_SESSION_KEY)
      window.sessionStorage.removeItem(AUTH_SESSION_KEY)
      window.localStorage.removeItem(AUTH_SAVED_AT_KEY)
      window.sessionStorage.removeItem(AUTH_SAVED_AT_KEY)
      window.location.replace('/login')
    }

    throw new ApiError(
      response.status,
      error.code ?? `HTTP_${response.status}`,
      error.detail ?? error.message ?? 'API 요청에 실패했습니다.',
      error.detail,
    )
  }

  return response.json() as Promise<T>
}
