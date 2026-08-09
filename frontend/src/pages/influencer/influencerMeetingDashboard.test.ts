import { describe, expect, it } from 'vitest'
import type { ManagerMeetingSummary } from '../../api/managerMeetings'
import {
  getDashboardMeetingAction,
  selectRecentMeeting,
} from './influencerMeetingDashboard'

function meeting(
  meetingId: string,
  status: string,
  scheduledStartAt: string,
  participantCount = 0,
): ManagerMeetingSummary {
  return {
    meetingId,
    title: `팬미팅 ${meetingId}`,
    influencerName: 'Melly',
    scheduledStartAt,
    status,
    applicationStartAt: null,
    applicationEndAt: null,
    applicationCount: 0,
    participantCount,
  }
}

describe('influencer meeting dashboard', () => {
  it('진행 중인 팬미팅 한 건을 가장 먼저 고른다', () => {
    const now = new Date('2026-08-04T10:00:00')
    const selected = selectRecentMeeting(
      [
        meeting('ready', 'READY', '2026-08-04T11:00:00'),
        meeting('live', 'LIVE', '2026-08-04T12:00:00'),
      ],
      now,
    )

    expect(selected?.meetingId).toBe('live')
  })

  it('진행 중인 일정이 없으면 가장 가까운 예정 팬미팅을 고른다', () => {
    const selected = selectRecentMeeting(
      [
        meeting('later', 'PUBLISHED', '2026-08-09T12:00:00'),
        meeting('nearest', 'PUBLISHED', '2026-08-07T12:00:00'),
        meeting('ended', 'ENDED', '2026-08-03T12:00:00'),
      ],
      new Date('2026-08-04T10:00:00'),
    )

    expect(selected?.meetingId).toBe('nearest')
  })

  it('예정 팬미팅이 없으면 가장 최근 지난 팬미팅을 고른다', () => {
    const selected = selectRecentMeeting(
      [
        meeting('older', 'ENDED', '2026-08-01T12:00:00'),
        meeting('recent', 'ENDED', '2026-08-03T12:00:00'),
      ],
      new Date('2026-08-04T10:00:00'),
    )

    expect(selected).toBeUndefined()
  })

  it('예정 시간을 지났어도 종료되지 않은 팬미팅은 선택한다', () => {
    const selected = selectRecentMeeting(
      [meeting('ready-past', 'READY', '2026-08-03T12:00:00')],
      new Date('2026-08-04T10:00:00'),
    )

    expect(selected?.meetingId).toBe('ready-past')
  })

  it('진행 중이면 1인 운영자에게 대기실 입장 명칭으로 안내한다', () => {
    expect(
      getDashboardMeetingAction(
        meeting('17', 'LIVE', '2026-08-04T12:00:00'),
        'SOLO_INFLUENCER',
      ),
    ).toEqual({
      kind: 'navigate',
      label: '팬미팅 대기실 입장',
      to: '/influencer/fan-meetings/17/ready',
    })
  })

  it('진행 중이면 소속 인플루언서는 기존 명칭으로 대기실에 입장한다', () => {
    expect(
      getDashboardMeetingAction(
        meeting('17', 'LIVE', '2026-08-04T12:00:00'),
        'INFLUENCER',
      ),
    ).toEqual({
      kind: 'navigate',
      label: '팬미팅 입장',
      to: '/influencer/fan-meetings/17/ready',
    })
  })

  it('대기실이 열리기 전이면 1인 운영자를 팬미팅 상세로 보낸다', () => {
    expect(
      getDashboardMeetingAction(
        meeting('17', 'READY', '2026-08-04T12:00:00'),
        'SOLO_INFLUENCER',
      ),
    ).toEqual({
      kind: 'navigate',
      label: '상세 보기',
      to: '/manager/fan-meetings/17',
    })
  })

  it('대기실이 열리기 전이어도 소속 인플루언서는 장비 점검으로 보낸다', () => {
    expect(
      getDashboardMeetingAction(
        meeting('17', 'READY', '2026-08-04T12:00:00'),
        'INFLUENCER',
      ),
    ).toEqual({
      kind: 'navigate',
      label: '장비 점검',
      to: '/influencer/fan-meetings/17/device-check',
    })
  })

  it('1인은 추첨 완료 데이터를 결과 발표 확인 절차로 연결한다', () => {
    expect(
      getDashboardMeetingAction(
        meeting('17', 'APPLICATION_CLOSED', '2026-08-04T12:00:00', 30),
        'SOLO_INFLUENCER',
      ),
    ).toEqual({ kind: 'publish-results', label: '결과 발표' })
  })

  it('응모 진행 중에도 확장 기능인 응모자 관리로 연결하지 않는다', () => {
    expect(
      getDashboardMeetingAction(
        meeting('17', 'APPLICATION_OPEN', '2026-08-04T12:00:00'),
        'SOLO_INFLUENCER',
      ),
    ).toEqual({
      kind: 'navigate',
      label: '상세 보기',
      to: '/manager/fan-meetings/17',
    })
  })

  it('추첨 전에도 팬미팅 개요로만 연결한다', () => {
    expect(
      getDashboardMeetingAction(
        meeting('17', 'APPLICATION_CLOSED', '2026-08-04T12:00:00'),
        'SOLO_INFLUENCER',
      ),
    ).toEqual({
      kind: 'navigate',
      label: '추첨 진행',
      to: '/manager/fan-meetings/17',
    })
  })

  it('소속 인플루언서에게 운영 액션을 열지 않고 비활성 사유를 제공한다', () => {
    const action = getDashboardMeetingAction(
      meeting('17', 'APPLICATION_OPEN', '2026-08-04T12:00:00'),
      'INFLUENCER',
    )

    expect(action.kind).toBe('disabled')
    if (action.kind === 'disabled') expect(action.reason).toBeTruthy()
  })
})
