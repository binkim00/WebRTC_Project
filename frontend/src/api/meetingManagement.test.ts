// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isWaitingRoomOpen,
  startFanMeetingWithOpenWaitingRoom,
  transitionFanMeetingImmediately,
} from './meetingManagement'

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
  it('응모 즉시 시작은 운영 명령 하나로 처리한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('APPLICATION_OPEN'))
    vi.stubGlobal('fetch', fetchMock)

    await transitionFanMeetingImmediately(7, 'PUBLISHED', 'APPLICATION_OPEN', 'token')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/api\/v1\/fan-meetings\/7\/applications\/open$/)
    expect(init.method).toBe('POST')
    // 접수 기간을 다시 잡는 일은 서버가 하므로 화면은 본문을 보내지 않는다.
    expect(init.body).toBeUndefined()
  })

  it('응모 즉시 마감도 운영 명령 하나로 처리한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('APPLICATION_CLOSED'))
    vi.stubGlobal('fetch', fetchMock)

    await transitionFanMeetingImmediately(7, 'APPLICATION_OPEN', 'APPLICATION_CLOSED', 'token')

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/api\/v1\/fan-meetings\/7\/applications\/close$/)
  })

  it('일정 전 즉시 시작은 대기실을 먼저 열고 정식 start 명령을 호출한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okResponse('READY'))
      .mockResolvedValueOnce(okResponse('LIVE'))
    vi.stubGlobal('fetch', fetchMock)

    await transitionFanMeetingImmediately(8, 'READY', 'LIVE', 'token')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstCall = fetchMock.mock.calls[0]
    const secondCall = fetchMock.mock.calls[1]
    if (!firstCall || !secondCall) throw new Error('예상한 두 API 요청이 실행되지 않았습니다.')

    expect(firstCall[0]).toMatch(/\/api\/v1\/fan-meetings\/8\/waiting-room\/open$/)
    expect(secondCall[0]).toMatch(/\/api\/v1\/fan-meetings\/8\/start$/)
    expect((secondCall[1] as RequestInit).method).toBe('POST')
  })

  it('되돌아가는 전환은 서버에 요청하지 않고 막는다', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      transitionFanMeetingImmediately(7, 'APPLICATION_CLOSED', 'APPLICATION_OPEN', 'token'),
    ).rejects.toBeInstanceOf(TypeError)

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('isWaitingRoomOpen', () => {
  it('offset이 없는 서버 시각을 KST로 해석해 브라우저 시간대와 무관하게 판정한다', () => {
    // 2026-08-03T12:00:00+09:00 === 2026-08-03T03:00:00Z
    const justBefore = Date.parse('2026-08-03T02:59:59.000Z')
    const justAfter = Date.parse('2026-08-03T03:00:01.000Z')

    expect(isWaitingRoomOpen('2026-08-03T12:00:00', justBefore)).toBe(false)
    expect(isWaitingRoomOpen('2026-08-03T12:00:00', justAfter)).toBe(true)
  })

  it('오픈 시각이 없으면 제한이 없다고 본다', () => {
    expect(isWaitingRoomOpen(null)).toBe(true)
    expect(isWaitingRoomOpen(undefined)).toBe(true)
  })
})

describe('startFanMeetingWithOpenWaitingRoom', () => {
  it('대기실 오픈 시각을 현재로 당긴 뒤 start 명령을 호출한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okResponse('READY'))
      .mockResolvedValueOnce(okResponse('LIVE'))
    vi.stubGlobal('fetch', fetchMock)

    await startFanMeetingWithOpenWaitingRoom(9, 'token')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [openCall, startCall] = fetchMock.mock.calls
    if (!openCall || !startCall) throw new Error('예상한 두 API 요청이 실행되지 않았습니다.')

    expect(openCall[0]).toMatch(/\/api\/v1\/fan-meetings\/9\/waiting-room\/open$/)
    // 오픈 시각은 서버가 정하므로 화면은 본문을 보내지 않는다.
    expect((openCall[1] as RequestInit).body).toBeUndefined()
    expect(startCall[0]).toMatch(/\/api\/v1\/fan-meetings\/9\/start$/)
  })

  it('대기실 오픈이 실패해도 start 명령은 그대로 실행한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'ACCESS_DENIED', message: '권한이 없습니다.' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(okResponse('LIVE'))
    vi.stubGlobal('fetch', fetchMock)

    const result = await startFanMeetingWithOpenWaitingRoom(9, 'token')

    expect(result.status).toBe('LIVE')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]?.[0]).toMatch(/\/api\/v1\/fan-meetings\/9\/start$/)
  })
})
