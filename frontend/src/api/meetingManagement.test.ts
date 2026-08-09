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
  it('서버가 내려준 개방 여부를 오픈 시각보다 먼저 본다', () => {
    // 대기열을 방금 연 직후다. 응답의 queueOpenAt이 아직 예전 값이어도 서버는 열렸다고 본다.
    const beforeOpenAt = Date.parse('2026-08-03T02:59:59.000Z')

    expect(
      isWaitingRoomOpen(
        { waitingRoomOpen: true, queueOpenAt: '2026-08-03T12:00:00' },
        beforeOpenAt,
      ),
    ).toBe(true)
    expect(
      isWaitingRoomOpen({ waitingRoomOpen: false, queueOpenAt: null }, beforeOpenAt),
    ).toBe(false)
  })

  it('개방 여부가 없으면 offset이 없는 서버 시각을 KST로 해석해 판정한다', () => {
    // 2026-08-03T12:00:00+09:00 === 2026-08-03T03:00:00Z
    const justBefore = Date.parse('2026-08-03T02:59:59.000Z')
    const justAfter = Date.parse('2026-08-03T03:00:01.000Z')

    expect(isWaitingRoomOpen({ queueOpenAt: '2026-08-03T12:00:00' }, justBefore)).toBe(false)
    expect(isWaitingRoomOpen({ queueOpenAt: '2026-08-03T12:00:00' }, justAfter)).toBe(true)
  })

  it('오픈 시각이 없으면 제한이 없다고 본다', () => {
    expect(isWaitingRoomOpen({ queueOpenAt: null })).toBe(true)
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

  it('예정 시각이 지났으면 대기실만 열고 start를 호출한다', async () => {
    const fetchMock = stubFetch('LIVE')

    // 이미 시작 시각이 지났으면 조기 시작 폭을 넓힐 필요가 없다.
    await transitionFanMeetingImmediately(8, 'READY', 'LIVE', 'token', {
      scheduledStartAt: '2020-01-01T00:00:00',
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(
      /\/api\/v1\/fan-meetings\/8\/waiting-room\/open$/,
    )
    expect(fetchMock.mock.calls[1]?.[0]).toMatch(/\/api\/v1\/fan-meetings\/8\/start$/)
  })

  it('예정 시각 전 지금 시작은 조기 시작 폭을 먼저 넓힌다', async () => {
    /*
     * 서버 start()는 `now >= 예정시각 - earlyStartMinutes`만 허용한다. 이 PATCH가 빠지면
     * "지금 시작"이 FAN_MEETING_START_NOT_ALLOWED로 거절되므로 호출 순서까지 고정한다.
     */
    const fetchMock = stubFetch('LIVE')
    /*
     * 서버가 주는 예정 시각은 타임존 표기가 없는 KST 벽시계 문자열이다. 그래서 UTC 기준
     * toISOString을 그대로 쓰면 KST로 해석되며 9시간 앞당겨져 "이미 지난 시각"이 된다.
     * 지금부터 3시간 뒤를 KST 벽시계로 적으려면 UTC에 9시간을 더한 값을 잘라 써야 한다.
     */
    const scheduledStartAt = new Date(Date.now() + (3 + 9) * 60 * 60_000)
      .toISOString()
      .slice(0, 19)

    await transitionFanMeetingImmediately(8, 'READY', 'LIVE', 'token', { scheduledStartAt })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const [patchCall, openCall, startCall] = fetchMock.mock.calls
    if (!patchCall || !openCall || !startCall) {
      throw new Error('예상한 세 API 요청이 실행되지 않았습니다.')
    }

    expect(patchCall[0]).toMatch(/\/api\/v1\/fan-meetings\/8$/)
    expect((patchCall[1] as RequestInit).method).toBe('PATCH')
    const patchBody = JSON.parse(String((patchCall[1] as RequestInit).body))
    // 예정 시각까지 남은 만큼 넓힌다. 예정 시각 자체는 바꾸지 않는다.
    expect(patchBody.operation.earlyStartMinutes).toBeGreaterThanOrEqual(180)
    expect(patchBody).not.toHaveProperty('scheduledStartAt')

    expect(openCall[0]).toMatch(/\/api\/v1\/fan-meetings\/8\/waiting-room\/open$/)
    expect(startCall[0]).toMatch(/\/api\/v1\/fan-meetings\/8\/start$/)
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
