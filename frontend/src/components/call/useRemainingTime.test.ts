// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CallSessionStatusResponse } from '../../api/callSessions'
import { useRemainingTime } from './useRemainingTime'

function status(
  overrides: Partial<CallSessionStatusResponse> = {},
): CallSessionStatusResponse {
  return {
    callSessionId: 1,
    status: 'CONNECTING',
    startedAt: null,
    endsAt: null,
    endedAt: null,
    serverNow: '2026-08-03T12:00:00',
    remainingSec: 0,
    reconnectAllowedUntil: null,
    endReason: null,
    fanLanguage: null,
    influencerLanguage: null,
    ...overrides,
  }
}

describe('useRemainingTime', () => {
  it('통화 시작 전에는 00:00 대신 설정된 통화 시간을 보여 주고 카운트하지 않는다', () => {
    const { result } = renderHook(() => useRemainingTime(status(), 300))

    expect(result.current.label).toBe('05:00')
    expect(result.current.counting).toBe(false)
    expect(result.current.expired).toBe(false)
  })

  it('설정된 통화 시간을 모르면 00:00으로 두되 만료로 오해하지 않는다', () => {
    const { result } = renderHook(() => useRemainingTime(status()))

    expect(result.current.label).toBe('00:00')
    expect(result.current.counting).toBe(false)
    expect(result.current.expired).toBe(false)
  })

  it('서버가 종료 시각을 확정하면 남은 시간을 카운트한다', () => {
    const { result } = renderHook(() =>
      useRemainingTime(
        status({ status: 'ACTIVE', endsAt: '2026-08-03T12:02:05', remainingSec: 125 }),
        300,
      ),
    )

    expect(result.current.label).toBe('02:05')
    expect(result.current.counting).toBe(true)
    expect(result.current.expired).toBe(false)
  })

  it('남은 시간이 0이면 만료로 알려 통화를 마무리할 수 있게 한다', () => {
    const { result } = renderHook(() =>
      useRemainingTime(
        status({ status: 'ACTIVE', endsAt: '2026-08-03T12:00:00', remainingSec: 0 }),
        300,
      ),
    )

    expect(result.current.label).toBe('00:00')
    expect(result.current.counting).toBe(true)
    expect(result.current.expired).toBe(true)
  })
})
