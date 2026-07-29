import { ApiError } from './ApiError'
import {
  AUTH_EXPIRED_EVENT,
  clearAuthSession,
  getAuthSession,
  isLoginResponse,
  replaceAuthSession,
  type LoginResponse,
} from './authSession'

const API_URL = import.meta.env.VITE_API_BASE_URL ?? ''

type ErrorResponse = {
  code?: string
  message?: string
  detail?: string
}

export type ApiRequestOptions = RequestInit & {
  authToken?: string
}

let refreshPromise: Promise<LoginResponse | null> | null = null

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
  return requestWithRefresh<T>(path, options, true)
}

async function refreshStoredSession(): Promise<LoginResponse | null> {
  if (refreshPromise) return refreshPromise

  const session = getAuthSession()
  if (!session) return null

  refreshPromise = fetch(`${API_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  })
    .then(async (response) => {
      if (!response.ok) return null

      const data: unknown = await response.json()
      if (!isLoginResponse(data)) return null

      replaceAuthSession(data)
      return data
    })
    .catch(() => null)
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

async function requestWithRefresh<T>(
  path: string,
  options: ApiRequestOptions,
  allowRefresh: boolean,
): Promise<T> {
  const { authToken, ...requestOptions } = options

  const response = await fetch(`${API_URL}${path}`, {
    ...requestOptions,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...requestOptions.headers,
    },
  })

  if (response.status === 401 && authToken && allowRefresh) {
    const refreshedSession = await refreshStoredSession()

    if (refreshedSession) {
      return requestWithRefresh<T>(
        path,
        { ...options, authToken: refreshedSession.accessToken },
        false,
      )
    }

    clearAuthSession()
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
  }

  if (!response.ok) {
    const error = await readErrorResponse(response)

    throw new ApiError(
      response.status,
      error.code ?? `HTTP_${response.status}`,
      error.detail ?? error.message ?? 'API 요청에 실패했습니다.',
      error.detail,
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  if (!text) {
    return undefined as T
  }

  try {
    return JSON.parse(text) as T
  } catch {
    return text as T
  }
}
