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
      waitingRoomOpenAt: '2026-08-03T12:00:00.000',
    })
    expect(secondCall[0]).toMatch(/\/api\/v1\/fan-meetings\/8\/start$/)
    expect((secondCall[1] as RequestInit).method).toBe('POST')
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
  it('정식 PATCH로 대기열 오픈 시각을 당긴 뒤 start 명령을 호출한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okResponse('READY'))
      .mockResolvedValueOnce(okResponse('LIVE'))
    vi.stubGlobal('fetch', fetchMock)

    await startFanMeetingWithOpenWaitingRoom(9, 'token')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [openCall, startCall] = fetchMock.mock.calls
    if (!openCall || !startCall) throw new Error('예상한 두 API 요청이 실행되지 않았습니다.')

    // 배포 환경에는 /test-control이 없으므로 정식 PATCH를 먼저 시도해야 한다.
    expect(openCall[0]).toMatch(/\/api\/v1\/fan-meetings\/9$/)
    expect((openCall[1] as RequestInit).method).toBe('PATCH')
    // 오픈 시각만 보내 다른 운영 설정은 서버가 기존 값으로 유지하게 한다.
    expect(Object.keys(JSON.parse(String((openCall[1] as RequestInit).body)).operation)).toEqual([
      'queueOpenAt',
    ])
    expect(startCall[0]).toMatch(/\/api\/v1\/fan-meetings\/9\/start$/)
  })

  it('정식 PATCH가 막히면 시연용 경로를 시도하고, 그마저 없으면 start만 진행한다', async () => {
    const fetchMock = vi
      .fn()
      // 응모가 시작된 뒤에는 백엔드가 queueOpenAt 변경을 거부한다.
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 'FAN_MEETING_STATE_CONFLICT', message: '상태 충돌' }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      // 배포 환경에는 /test-control 컨트롤러가 등록되지 않아 404다.
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'NOT_FOUND', message: '없음' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(okResponse('LIVE'))
    vi.stubGlobal('fetch', fetchMock)

    const result = await startFanMeetingWithOpenWaitingRoom(9, 'token')

    // 오픈에 실패해도 시작 자체는 막지 않는다. 실제 오픈 여부는 호출자가 응답으로 다시 확인한다.
    expect(result.status).toBe('LIVE')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[1]?.[0]).toMatch(/\/api\/v1\/fan-meetings\/9\/test-control$/)
    expect(fetchMock.mock.calls[2]?.[0]).toMatch(/\/api\/v1\/fan-meetings\/9\/start$/)
  })
})

describe('transitionFanMeetingImmediately 정식 API 경로', () => {
  it('응모 즉시 시작은 일정을 알 수 있으면 PATCH로 응모 시작 일시만 당긴다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('PUBLISHED'))
    vi.stubGlobal('fetch', fetchMock)

    await transitionFanMeetingImmediately(7, 'PUBLISHED', 'APPLICATION_OPEN', 'token', {
      applicationStartAt: '2026-08-10T09:00:00',
      applicationEndAt: '2026-08-11T09:00:00',
      applicationResultAnnouncementAt: '2026-08-11T12:00:00',
      scheduledStartAt: '2026-08-12T19:00:00',
      now: new Date('2026-08-03T03:00:00.000Z'),
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    // 시연용 경로가 아니라 배포 환경에도 있는 정식 PATCH를 써야 한다.
    expect(url).toMatch(/\/api\/v1\/fan-meetings\/7$/)
    expect(init.method).toBe('PATCH')
    // 마감·발표 시각이 아직 미래이므로 시작 시각만 옮기고 나머지는 그대로 둔다.
    expect(JSON.parse(String(init.body))).toEqual({
      application: {
        startAt: '2026-08-03T12:00:00.000',
        endAt: '2026-08-11T09:00:00.000',
      },
    })
  })

  it('즉시 시작은 조기 시작 허용 폭을 넓히는 PATCH 뒤 정식 start 명령을 호출한다', async () => {
    // 요청마다 새 Response를 만든다. 같은 객체를 재사용하면 본문이 이미 읽혀 두 번째 호출이 깨진다.
    const fetchMock = vi.fn().mockImplementation(() => okResponse('LIVE'))
    vi.stubGlobal('fetch', fetchMock)

    await transitionFanMeetingImmediately(8, 'READY', 'LIVE', 'token', {
      // 현재(12:00 KST)에서 2시간 뒤가 예정 시각이다.
      scheduledStartAt: '2026-08-03T14:00:00',
      now: new Date('2026-08-03T03:00:00.000Z'),
    })

    const [firstCall, secondCall, thirdCall] = fetchMock.mock.calls
    if (!firstCall || !secondCall || !thirdCall) {
      throw new Error('예상한 세 API 요청이 실행되지 않았습니다.')
    }

    expect(firstCall[0]).toMatch(/\/api\/v1\/fan-meetings\/8$/)
    // 120분 + 경계 여유 1분. 서버는 now >= 예정시각 - 허용폭일 때 시작을 허용한다.
    expect(JSON.parse(String((firstCall[1] as RequestInit).body))).toEqual({
      operation: { earlyStartMinutes: 121 },
    })
    expect(secondCall[0]).toMatch(/\/api\/v1\/fan-meetings\/8$/)
    expect(thirdCall[0]).toMatch(/\/api\/v1\/fan-meetings\/8\/start$/)
  })

  it('아직 열리지 않은 응모는 기간을 최소로 접어 곧 마감되게 만든다', async () => {
    const fetchMock = vi.fn().mockImplementation(() => okResponse('PUBLISHED'))
    vi.stubGlobal('fetch', fetchMock)

    await transitionFanMeetingImmediately(7, 'PUBLISHED', 'APPLICATION_CLOSED', 'token', {
      applicationStartAt: '2026-08-10T09:00:00',
      applicationEndAt: '2026-08-11T09:00:00',
      applicationResultAnnouncementAt: '2026-08-11T12:00:00',
      scheduledStartAt: '2026-08-12T19:00:00',
      now: new Date('2026-08-03T03:00:00.000Z'),
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/api\/v1\/fan-meetings\/7$/)
    // 지금 열리고 90초 뒤 마감된다. 기존 결과 발표 시각(08-11)은 마감 뒤이면서 팬미팅 시작 전이라
    // 그대로 둔다. 백엔드 결과 발표 명령에는 시각 조건이 없어 운영자가 먼저 발표할 수 있다.
    expect(JSON.parse(String(init.body))).toEqual({
      application: {
        startAt: '2026-08-03T12:00:00.000',
        endAt: '2026-08-03T12:01:30.000',
      },
    })
  })

  it('결과 발표 시각이 새 마감보다 앞서면 마감 뒤로 옮긴다', async () => {
    const fetchMock = vi.fn().mockImplementation(() => okResponse('PUBLISHED'))
    vi.stubGlobal('fetch', fetchMock)

    await transitionFanMeetingImmediately(7, 'PUBLISHED', 'APPLICATION_CLOSED', 'token', {
      // 발표 시각이 이미 지났으면 그대로 두면 검증(마감 ≤ 발표)에서 걸린다.
      applicationResultAnnouncementAt: '2026-08-01T09:00:00',
      scheduledStartAt: '2026-08-12T19:00:00',
      now: new Date('2026-08-03T03:00:00.000Z'),
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body)).application.resultAnnouncementAt).toBe(
      '2026-08-03T12:02:00.000',
    )
  })

  it('팬미팅 시작이 너무 가까우면 응모 기간을 접지 않고 이유를 알린다', async () => {
    const fetchMock = vi.fn().mockImplementation(() => okResponse('PUBLISHED'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      transitionFanMeetingImmediately(7, 'PUBLISHED', 'APPLICATION_CLOSED', 'token', {
        // 현재(12:00 KST)에서 1분 뒤 시작이면 마감·발표를 그 앞에 둘 수 없다.
        scheduledStartAt: '2026-08-03T12:01:00',
        now: new Date('2026-08-03T03:00:00.000Z'),
      }),
    ).rejects.toThrow(/응모 기간을 줄일 수 없습니다/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('응모 즉시 마감은 시연용 경로가 없으면 원인을 설명하는 오류를 던진다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 'NOT_FOUND', message: '없음' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      transitionFanMeetingImmediately(7, 'APPLICATION_OPEN', 'APPLICATION_CLOSED', 'token', {
        now: new Date('2026-08-03T03:00:00.000Z'),
      }),
    ).rejects.toThrow(/지원하지 않습니다/)
  })
})
