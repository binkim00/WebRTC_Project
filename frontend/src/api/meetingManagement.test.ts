// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isWaitingRoomOpen,
  openWaitingRoomImmediately,
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

/** 요청마다 새 Response를 준다. 같은 객체를 재사용하면 본문이 이미 읽혀 두 번째 호출이 깨진다. */
function stubFetch(status = 'APPLICATION_OPEN') {
  const fetchMock = vi.fn().mockImplementation(() => okResponse(status))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

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

describe('transitionFanMeetingImmediately', () => {
  /*
   * 정식 명령 3개(applications/open·applications/close·waiting-room/open)만 호출해야 한다.
   * 예전에는 시연용 `/test-control`에 얹혀 있었고, 그 경로는 운영 배포에서 빈이 등록되지 않아
   * 404가 났다. 그래서 "무엇을 호출하는지"를 테스트로 고정한다.
   */
  it('응모 즉시 시작은 applications/open을 본문 없이 POST한다', async () => {
    const fetchMock = stubFetch('APPLICATION_OPEN')

    await transitionFanMeetingImmediately(7, 'PUBLISHED', 'APPLICATION_OPEN', 'token')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/api\/v1\/fan-meetings\/7\/applications\/open$/)
    expect(init.method).toBe('POST')
    // 서버가 자기 시계로 계산하므로 프론트가 일정을 보낼 필요가 없다.
    expect(init.body).toBeUndefined()
  })

  it('응모 즉시 마감은 applications/close를 POST한다', async () => {
    const fetchMock = stubFetch('APPLICATION_CLOSED')

    await transitionFanMeetingImmediately(7, 'APPLICATION_OPEN', 'APPLICATION_CLOSED', 'token')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(
      /\/api\/v1\/fan-meetings\/7\/applications\/close$/,
    )
  })

  it('대기실 열기가 실패하면 시작하지 않는다', async () => {
    // 팬이 들어올 수 없는 상태로 팬미팅을 진행 중으로 만들지 않는다.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ code: 'FAN_MEETING_STATE_CONFLICT', message: '상태 충돌' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      transitionFanMeetingImmediately(8, 'READY', 'LIVE', 'token'),
    ).rejects.toThrow()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(
      /\/api\/v1\/fan-meetings\/8\/waiting-room\/open$/,
    )
  })

  it('지금 시작은 대기실을 먼저 열고 start를 호출하며 예정 시각은 건드리지 않는다', async () => {
    const fetchMock = stubFetch('LIVE')

    await transitionFanMeetingImmediately(8, 'READY', 'LIVE', 'token')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [openCall, startCall] = fetchMock.mock.calls
    if (!openCall || !startCall) throw new Error('예상한 두 API 요청이 실행되지 않았습니다.')

    expect(openCall[0]).toMatch(/\/api\/v1\/fan-meetings\/8\/waiting-room\/open$/)
    expect(startCall[0]).toMatch(/\/api\/v1\/fan-meetings\/8\/start$/)
    // 예정 시작 시각을 옮기던 PATCH가 사라졌는지 확인한다.
    expect(
      fetchMock.mock.calls.some(
        (call) => (call[1] as RequestInit | undefined)?.method === 'PATCH',
      ),
    ).toBe(false)
  })

  it('명령이 없는 역방향·건너뛰기 조합은 요청 없이 거부한다', async () => {
    const fetchMock = stubFetch()

    // 마감된 응모를 다시 열거나, 아직 열리지 않은 응모를 곧바로 마감하는 명령은 없다.
    await expect(
      transitionFanMeetingImmediately(7, 'APPLICATION_CLOSED', 'APPLICATION_OPEN', 'token'),
    ).rejects.toThrow()
    await expect(
      transitionFanMeetingImmediately(7, 'PUBLISHED', 'APPLICATION_CLOSED', 'token'),
    ).rejects.toThrow()
    await expect(
      transitionFanMeetingImmediately(7, 'ENDED', 'LIVE', 'token'),
    ).rejects.toThrow()

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('openWaitingRoomImmediately', () => {
  it('waiting-room/open을 POST한다', async () => {
    const fetchMock = stubFetch('READY')

    await openWaitingRoomImmediately(9, 'token')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/api\/v1\/fan-meetings\/9\/waiting-room\/open$/)
    expect(init.method).toBe('POST')
  })
})

describe('startFanMeetingWithOpenWaitingRoom', () => {
  it('대기실을 먼저 연 뒤 start 명령을 호출한다', async () => {
    const fetchMock = stubFetch('LIVE')

    await startFanMeetingWithOpenWaitingRoom(9, 'token')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(
      /\/api\/v1\/fan-meetings\/9\/waiting-room\/open$/,
    )
    expect(fetchMock.mock.calls[1]?.[0]).toMatch(/\/api\/v1\/fan-meetings\/9\/start$/)
  })

  it('대기실 열기가 실패해도 start는 그대로 실행한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 'FAN_MEETING_STATE_CONFLICT', message: '상태 충돌' }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(okResponse('LIVE'))
    vi.stubGlobal('fetch', fetchMock)

    // 실제 오픈 여부는 응답의 queueOpenAt으로 호출자가 다시 확인한다. 시작 자체는 막지 않는다.
    const result = await startFanMeetingWithOpenWaitingRoom(9, 'token')

    expect(result.status).toBe('LIVE')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]?.[0]).toMatch(/\/api\/v1\/fan-meetings\/9\/start$/)
  })
})
