// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { transitionFanMeetingImmediately } from './meetingManagement'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function okResponse(status: string) {
  return new Response(JSON.stringify({ data: { status } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('transitionFanMeetingImmediately', () => {
  it('응모 즉시 시작은 서버 기간 검증을 통과하도록 KST 시작 시각도 현재로 변경한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('APPLICATION_OPEN'))
    vi.stubGlobal('fetch', fetchMock)

    await transitionFanMeetingImmediately(
      7,
      'PUBLISHED',
      'APPLICATION_OPEN',
      'token',
      {
        applicationStartAt: '2026-08-04T09:00:00',
        applicationEndAt: '2026-08-05T09:00:00',
        now: new Date('2026-08-03T03:00:00.000Z'),
      },
    )

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/api\/v1\/fan-meetings\/7\/test-control$/)
    expect(JSON.parse(String(init.body))).toEqual({
      status: 'APPLICATION_OPEN',
      applicationOpenAt: '2026-08-03T12:00:00.000',
    })
  })

  it('일정 전 즉시 시작은 예정 시각을 현재로 맞춘 뒤 정식 start 명령을 호출한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okResponse('READY'))
      .mockResolvedValueOnce(okResponse('LIVE'))
    vi.stubGlobal('fetch', fetchMock)

    await transitionFanMeetingImmediately(
      8,
      'READY',
      'LIVE',
      'token',
      { now: new Date('2026-08-03T03:00:00.000Z') },
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstCall = fetchMock.mock.calls[0]
    const secondCall = fetchMock.mock.calls[1]
    if (!firstCall || !secondCall) throw new Error('예상한 두 API 요청이 실행되지 않았습니다.')

    expect(firstCall[0]).toMatch(/\/api\/v1\/fan-meetings\/8\/test-control$/)
    expect(JSON.parse(String((firstCall[1] as RequestInit).body))).toEqual({
      scheduledStartAt: '2026-08-03T12:00:00.000',
    })
    expect(secondCall[0]).toMatch(/\/api\/v1\/fan-meetings\/8\/start$/)
    expect((secondCall[1] as RequestInit).method).toBe('POST')
  })
})
