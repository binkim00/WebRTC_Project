// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchOwnedMeetings } from './managerMeetings'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function meeting(meetingId: number, status: string, scheduledDay = meetingId) {
  return {
    meetingId,
    title: `팬미팅 ${meetingId}`,
    influencerName: '인플루언서',
    scheduledStartAt: `2026-08-${String(scheduledDay).padStart(2, '0')}T19:00:00`,
    status,
    applicationStartAt: null,
    applicationEndAt: null,
    applicationCount: 0,
    participantCount: 0,
  }
}

describe('fetchOwnedMeetings endedFirst', () => {
  it('종료된 팬미팅을 전체 결과 앞에 놓은 뒤 화면 크기로 페이지를 나눈다', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(
        JSON.stringify({
          data: {
            content: [
              meeting(1, 'LIVE'),
              meeting(2, 'ENDED', 8),
              meeting(3, 'READY'),
              meeting(4, 'ENDED', 3),
              meeting(5, 'PUBLISHED'),
              meeting(6, 'ENDED', 1),
            ],
            page: 0,
            size: 100,
            totalElements: 6,
            totalPages: 1,
            hasNext: false,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )),
    )
    vi.stubGlobal('fetch', fetchMock)

    const firstPage = await fetchOwnedMeetings(
      { endedFirst: true, page: 0, size: 2 },
      'token',
    )
    const secondPage = await fetchOwnedMeetings(
      { endedFirst: true, page: 1, size: 2 },
      'token',
    )

    expect(firstPage.content.map((item) => item.meetingId)).toEqual(['6', '4'])
    expect(secondPage.content.map((item) => item.meetingId)).toEqual(['2', '5'])
    expect(firstPage.totalElements).toBe(6)
    expect(firstPage.totalPages).toBe(3)
  })
})
