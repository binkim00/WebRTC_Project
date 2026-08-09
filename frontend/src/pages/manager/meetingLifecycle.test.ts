import { describe, expect, it } from 'vitest'
import {
  deriveScheduleDefaults,
  getAvailableActions,
  getScheduleErrors,
  normalizeDetailTab,
} from './meetingLifecycle'

const NOW = new Date('2026-08-03T12:00:00.000Z')

describe('getAvailableActions - 수동 상태 전환', () => {
  it('발행 상태이고 응모 기능을 사용하는 경우에만 응모를 즉시 시작할 수 있다', () => {
    expect(
      getAvailableActions({
        status: 'PUBLISHED',
        applicationEnabled: true,
        applicationStartAt: '2026-08-10T12:00:00.000Z',
        now: NOW,
      }).canOpenApplicationsNow,
    ).toBe(true)

    expect(
      getAvailableActions({
        status: 'PUBLISHED',
        applicationEnabled: false,
        now: NOW,
      }).canOpenApplicationsNow,
    ).toBe(false)

    expect(
      getAvailableActions({
        status: 'DRAFT',
        applicationEnabled: true,
        now: NOW,
      }).canOpenApplicationsNow,
    ).toBe(false)
  })

  it('응모 접수 중에는 예약 마감 시각 전에도 응모를 즉시 마감할 수 있다', () => {
    const actions = getAvailableActions({
      status: 'APPLICATION_OPEN',
      applicationEndAt: '2026-08-10T12:00:00.000Z',
      now: NOW,
    })

    expect(actions.canCloseApplicationsNow).toBe(true)
    expect(actions.canDraw).toBe(false)
  })

  it('READY 상태와 확정 참가자가 있으면 예약 시각 전에도 수동 시작을 허용한다', () => {
    const actions = getAvailableActions({
      status: 'READY',
      scheduledStartAt: '2026-08-03T14:00:00.000Z',
      earlyStartMinutes: 30,
      participantCount: 1,
      now: NOW,
    })

    // 자동/일반 시작 가능 여부와 관리자의 명시적 수동 시작 권한을 분리해 검증한다.
    expect(actions.canStart).toBe(false)
    expect(actions.canStartNow).toBe(true)
    expect(actions.startBlockedReason).toContain('조기 시작 허용 시각')
  })

  it('확정 참가자가 없거나 READY가 아니면 수동 시작도 차단한다', () => {
    expect(
      getAvailableActions({
        status: 'READY',
        participantCount: 0,
        now: NOW,
      }).canStartNow,
    ).toBe(false)

    expect(
      getAvailableActions({
        status: 'APPLICATION_CLOSED',
        participantCount: 3,
        now: NOW,
      }).canStartNow,
    ).toBe(false)
  })

  it('조기 시작 허용 시각에 도달하면 일반 시작과 수동 시작이 모두 가능하다', () => {
    const actions = getAvailableActions({
      status: 'READY',
      scheduledStartAt: '2026-08-03T12:30:00.000Z',
      earlyStartMinutes: 30,
      participantCount: 2,
      now: NOW,
    })

    expect(actions.canStart).toBe(true)
    expect(actions.canStartNow).toBe(true)
    expect(actions.startBlockedReason).toBeUndefined()
  })

  it('진행 중에는 종료만 허용하고 이전 단계의 수동 전환은 모두 닫는다', () => {
    const actions = getAvailableActions({
      status: 'LIVE',
      applicationEnabled: true,
      participantCount: 4,
      now: NOW,
    })

    expect(actions.canEnd).toBe(true)
    expect(actions.canOpenApplicationsNow).toBe(false)
    expect(actions.canCloseApplicationsNow).toBe(false)
    expect(actions.canStartNow).toBe(false)
  })
})

describe('normalizeDetailTab', () => {
  // 응모자·추첨 탭이 상세 화면에 연결된 뒤로는 개요로 되돌리지 않는다.
  // (연결 전에는 빈 화면을 막기 위해 overview로 보냈다.)
  it('연결된 탭 요청은 그대로 유지한다', () => {
    expect(normalizeDetailTab('applicants')).toBe('applicants')
    expect(normalizeDetailTab('settings')).toBe('settings')
    expect(normalizeDetailTab('application-form')).toBe('application-form')
    expect(normalizeDetailTab('test-control')).toBe('test-control')
  })

  it('알 수 없는 탭이나 값이 없으면 개요로 보낸다', () => {
    expect(normalizeDetailTab('unknown-tab')).toBe('overview')
    expect(normalizeDetailTab(null)).toBe('overview')
  })
})

describe('deriveScheduleDefaults - 예정 일시 기준 일정 자동 채움', () => {
  const now = new Date('2026-08-03T12:00:00')

  it('여유가 충분하면 표준 간격(마감 24시간 전, 발표 23시간 전, 오픈 30분 전)으로 채운다', () => {
    const defaults = deriveScheduleDefaults('2026-08-20T19:00', now)

    expect(defaults).toEqual({
      applicationStartAt: '2026-08-13T19:00',
      applicationEndAt: '2026-08-19T19:00',
      resultAnnouncementAt: '2026-08-19T20:00',
      queueOpenAt: '2026-08-20T18:30',
    })
  })

  it('응모 시작이 과거가 되지 않도록 지금+10분을 하한으로 쓴다', () => {
    const defaults = deriveScheduleDefaults('2026-08-05T19:00', now)

    expect(defaults?.applicationStartAt).toBe('2026-08-03T12:10')
    expect(defaults?.applicationEndAt).toBe('2026-08-04T19:00')
  })

  it('예정 일시가 임박하면 지금+10분~예정 일시 구간을 압축해 순서를 지킨다', () => {
    const defaults = deriveScheduleDefaults('2026-08-03T15:00', now)

    expect(defaults).not.toBeNull()
    const points = [
      defaults?.applicationStartAt,
      defaults?.applicationEndAt,
      defaults?.resultAnnouncementAt,
      defaults?.queueOpenAt,
      '2026-08-03T15:00',
    ].map((value) => new Date(value ?? '').getTime())
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i]).toBeGreaterThan(points[i - 1] ?? Number.NaN)
    }
    // 자동값은 공통 검증 규칙도 통과해야 한다.
    expect(
      getScheduleErrors({
        scheduledStartAt: '2026-08-03T15:00',
        applicationEnabled: true,
        applicationStartAt: defaults?.applicationStartAt ?? null,
        applicationEndAt: defaults?.applicationEndAt ?? null,
        resultAnnouncementAt: defaults?.resultAnnouncementAt ?? null,
        queueOpenAt: defaults?.queueOpenAt ?? '',
      }),
    ).toEqual([])
  })

  it('예정 일시가 너무 임박하거나 과거·비정상 값이면 채우지 않는다', () => {
    expect(deriveScheduleDefaults('2026-08-03T12:15', now)).toBeNull()
    expect(deriveScheduleDefaults('2026-08-01T12:00', now)).toBeNull()
    expect(deriveScheduleDefaults('', now)).toBeNull()
    expect(deriveScheduleDefaults('not-a-date', now)).toBeNull()
  })
})
