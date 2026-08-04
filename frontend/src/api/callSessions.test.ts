// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { endCallSessionByFan } from './callSessions'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('endCallSessionByFan', () => {
  it('팬의 통화 종료를 실제 서버 end 명령에 연결한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            callSessionId: 31,
            status: 'ENDED',
            endedAt: '2026-08-03T12:03:00',
            endReason: 'NORMAL',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await endCallSessionByFan('31', { authToken: 'fan-token' })

    expect(result.status).toBe('ENDED')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/api\/v1\/call-sessions\/31\/end$/)
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer fan-token')
  })
})
