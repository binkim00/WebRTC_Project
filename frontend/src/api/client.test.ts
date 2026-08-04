// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearAuthSession, getAuthSession, saveAuthSession, type LoginResponse } from './authSession'
import { apiRequest } from './client'

afterEach(() => {
  clearAuthSession()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function requestHeadersOf(fetchMock: ReturnType<typeof vi.fn>, callIndex = 0): Headers {
  const call = fetchMock.mock.calls[callIndex]
  const init = call?.[1] as RequestInit | undefined
  return new Headers(init?.headers)
}

describe('apiRequest', () => {
  it('본문이 없는 요청에는 JSON Content-Type을 강제하지 않는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await apiRequest('/api/v1/health', { method: 'GET' })

    expect(requestHeadersOf(fetchMock).get('Content-Type')).toBeNull()
    expect(requestHeadersOf(fetchMock).get('Accept')).toBe('application/json')
  })

  it('JSON 문자열 본문에만 기본 Content-Type을 지정한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await apiRequest('/api/v1/example', { method: 'POST', body: JSON.stringify({ value: 1 }) })

    expect(requestHeadersOf(fetchMock).get('Content-Type')).toBe('application/json')
  })

  it('FormData의 multipart boundary는 브라우저가 정하도록 헤더를 비워 둔다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await apiRequest('/api/v1/upload', { method: 'POST', body: new FormData() })

    expect(requestHeadersOf(fetchMock).get('Content-Type')).toBeNull()
  })

  it('제한 시간을 넘긴 요청을 중단하고 구분 가능한 API 오류를 반환한다', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('중단됨', 'AbortError')))
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const request = apiRequest('/api/v1/slow', { timeoutMs: 25 })
    const rejection = expect(request).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT', status: 0 })
    await vi.advanceTimersByTimeAsync(25)

    await rejection
  })

  it('호출자의 AbortSignal을 내부 타임아웃과 함께 보존한다', async () => {
    const controller = new AbortController()
    let receivedSignal: AbortSignal | null | undefined
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        receivedSignal = init?.signal
        init?.signal?.addEventListener('abort', () => reject(new DOMException('중단됨', 'AbortError')))
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const request = apiRequest('/api/v1/cancelled', { signal: controller.signal, timeoutMs: 0 })
    const rejection = expect(request).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()

    await rejection
    expect(receivedSignal?.aborted).toBe(true)
  })

  it('401 응답 후 세션을 재발급하고 새 액세스 토큰으로 한 번만 재시도한다', async () => {
    const oldSession: LoginResponse = {
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      expiresIn: 3600,
      userId: 10,
      role: 'MANAGER',
      nickname: '운영자',
    }
    const renewedSession = { ...oldSession, accessToken: 'new-access', refreshToken: 'new-refresh' }
    saveAuthSession(oldSession, false)

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(renewedSession), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await apiRequest('/api/v1/protected', { method: 'GET', authToken: oldSession.accessToken })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(requestHeadersOf(fetchMock, 2).get('Authorization')).toBe('Bearer new-access')
    expect(getAuthSession()).toEqual(renewedSession)
  })

  it('동시에 여러 요청이 401을 받아도 재발급 API는 한 번만 호출한다', async () => {
    const oldSession: LoginResponse = {
      accessToken: 'shared-old-access',
      refreshToken: 'shared-refresh',
      expiresIn: 3600,
      userId: 11,
      role: 'SOLO_INFLUENCER',
      nickname: '솔로 인플루언서',
    }
    const renewedSession = { ...oldSession, accessToken: 'shared-new-access' }
    saveAuthSession(oldSession, false)

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/v1/auth/reissue')) {
        return Promise.resolve(
          new Response(JSON.stringify(renewedSession), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }

      const headers = new Headers(init?.headers)
      return Promise.resolve(
        new Response(null, {
          status: headers.get('Authorization') === 'Bearer shared-old-access' ? 401 : 204,
        }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    await Promise.all([
      apiRequest('/api/v1/protected/one', { authToken: oldSession.accessToken }),
      apiRequest('/api/v1/protected/two', { authToken: oldSession.accessToken }),
    ])

    const reissueCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).endsWith('/api/v1/auth/reissue'),
    )
    expect(reissueCalls).toHaveLength(1)
  })
})
