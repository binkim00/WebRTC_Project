import { ApiError } from './ApiError'
import {
  AUTH_EXPIRED_EVENT,
  clearAuthSession,
  getAuthSession,
  isLoginResponse,
  replaceAuthSession,
  type LoginResponse,
} from './authSession'
import { announceNotificationsMayHaveChanged } from './notificationEvents'
import { translate } from '../i18n'

const API_URL = import.meta.env.VITE_API_BASE_URL ?? ''
export const DEFAULT_API_TIMEOUT_MS = 15_000

type ErrorResponse = {
  code?: string
  message?: string
  detail?: string
}

export type ApiRequestOptions = RequestInit & {
  authToken?: string
  /** 0이면 자동 타임아웃을 끄고 호출자가 전달한 AbortSignal만 사용한다. */
  timeoutMs?: number
}

let refreshPromise: Promise<LoginResponse | null> | null = null

type RequestAbortContext = {
  signal: AbortSignal
  didTimeout: () => boolean
  cleanup: () => void
}

function requestAbortContext(
  externalSignal: AbortSignal | null | undefined,
  timeoutMs: number,
): RequestAbortContext {
  const controller = new AbortController()
  let timedOut = false

  const abortFromCaller = () => controller.abort(externalSignal?.reason)
  if (externalSignal?.aborted) abortFromCaller()
  else externalSignal?.addEventListener('abort', abortFromCaller, { once: true })

  // 폴링을 포함한 모든 API가 무기한 대기하지 않도록 공통 제한 시간을 둔다.
  const timer = timeoutMs > 0
    ? globalThis.setTimeout(() => {
        timedOut = true
        controller.abort()
      }, timeoutMs)
    : undefined

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      if (timer !== undefined) globalThis.clearTimeout(timer)
      externalSignal?.removeEventListener('abort', abortFromCaller)
    },
  }
}

function normalizedTimeout(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) return DEFAULT_API_TIMEOUT_MS
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new TypeError(translate('client.t1'))
  }
  return timeoutMs
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = DEFAULT_API_TIMEOUT_MS,
): Promise<Response> {
  const abortContext = requestAbortContext(init.signal, normalizedTimeout(timeoutMs))

  try {
    return await fetch(input, { ...init, signal: abortContext.signal })
  } catch (error) {
    if (abortContext.didTimeout()) {
      throw new ApiError(0, 'REQUEST_TIMEOUT', translate('client.t2'))
    }
    throw error
  } finally {
    abortContext.cleanup()
  }
}

function requestHeaders(options: RequestInit, authToken?: string): Headers {
  const headers = new Headers(options.headers)

  if (authToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${authToken}`)
  }
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')

  // 현재 문자열 본문 호출은 모두 JSON.stringify를 사용한다. FormData의 boundary는 브라우저에 맡긴다.
  if (typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  return headers
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
  return requestWithRefresh<T>(path, options, true)
}

/**
 * JSON이 아니라 파일을 주고받는 요청을 보내고, 액세스 토큰이 만료됐으면 갱신해 다시 보낸다.
 *
 * apiRequest는 본문을 JSON으로 고정하고 응답도 JSON으로 읽으므로 멀티파트 업로드나 파일
 * 내려받기는 이 경로를 쓸 수 없다. 그렇다고 fetch를 그냥 부르면 401을 만났을 때 토큰을
 * 갱신하지 못해 그 요청만 실패한다. 다른 요청은 조용히 갱신되며 살아 있어, 파일을 다루는
 * 기능만 "Invalid or expired access token."으로 죽는 것처럼 보인다.
 *
 * @param url 요청 주소
 * @param init fetch 옵션이며 Authorization 헤더는 이 함수가 채운다
 * @param authToken 현재 액세스 토큰
 * @returns 서버 응답이며 갱신에 실패하면 첫 401 응답을 그대로 돌려준다
 */
export async function authorizedFetch(
  url: string,
  init: RequestInit,
  authToken: string,
): Promise<Response> {
  const send = (token: string) =>
    fetch(url, {
      credentials: 'include',
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    })

  const response = await send(authToken)
  if (response.status !== 401) return response

  const refreshed = await refreshStoredSession()
  return refreshed ? send(refreshed.accessToken) : response
}

/**
 * 저장된 refresh 토큰으로 액세스 토큰을 다시 발급받는다.
 *
 * apiRequest가 401을 만났을 때 쓰지만, 공통 요청 경로를 탈 수 없는 파일 요청도 같은 갱신을
 * 해야 하므로 밖으로 열어 둔다. 동시에 여러 번 불려도 요청은 한 번만 나간다.
 *
 * @returns 갱신된 세션이며 갱신할 수 없으면 null
 */
export async function refreshStoredSession(): Promise<LoginResponse | null> {
  if (refreshPromise) return refreshPromise

  const session = getAuthSession()
  if (!session) return null

  refreshPromise = fetchWithTimeout(
    `${API_URL}/api/v1/auth/reissue`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    },
  )
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

/**
 * 알림을 만들 수 있는 요청이 성공하면 알림 벨에 다시 읽으라고 알린다.
 *
 * 알림 벨은 폴링 주기가 돌아와야 배지를 갱신한다. 사용자가 방금 한 행동의 결과는 그때까지
 * 기다리지 않고 바로 보이는 편이 자연스럽다. 모든 API가 지나가는 이 지점에서 한 번만 걸면
 * 화면마다 갱신을 따로 챙기지 않아도 된다.
 *
 * 조회(GET·HEAD)와 알림 API 자신은 제외한다. 알림 API까지 알리면 읽음 처리(PATCH)가 다시
 * 목록 조회를 부르는 되먹임이 생긴다.
 *
 * @param path 호출한 API 경로
 * @param method 호출에 쓴 HTTP 메서드이며 지정하지 않았으면 GET으로 본다
 */
function announceIfMutating(path: string, method: string | undefined): void {
  const verb = (method ?? 'GET').toUpperCase()
  if (verb === 'GET' || verb === 'HEAD') return
  if (path.startsWith('/api/v1/notifications')) return

  announceNotificationsMayHaveChanged()
}

async function requestWithRefresh<T>(
  path: string,
  options: ApiRequestOptions,
  allowRefresh: boolean,
): Promise<T> {
  const {
    authToken,
    timeoutMs,
    signal,
    ...requestOptions
  } = options

  const response = await fetchWithTimeout(
    `${API_URL}${path}`,
    {
      ...requestOptions,
      credentials: 'include',
      headers: requestHeaders(requestOptions, authToken),
      signal,
    },
    timeoutMs,
  )

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
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
    }
  }

  if (!response.ok) {
    const error = await readErrorResponse(response)

    throw new ApiError(
      response.status,
      error.code ?? `HTTP_${response.status}`,
      error.detail ?? error.message ?? translate('client.t3'),
      error.detail,
    )
  }

  announceIfMutating(path, requestOptions.method)

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
