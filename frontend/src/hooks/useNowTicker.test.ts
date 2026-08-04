// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNowTicker } from './useNowTicker'

/** 타이머를 진행시키면서 발생하는 상태 갱신을 act로 감싼다. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('useNowTicker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-04T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('초기값으로 현재 시각을 돌려준다', () => {
    const { result } = renderHook(() => useNowTicker(1_000))

    expect(result.current).toBe(Date.now())
  })

  it('주기마다 시각을 갱신한다', async () => {
    const { result } = renderHook(() => useNowTicker(1_000))
    const start = result.current

    await advance(3_000)

    expect(result.current).toBe(start + 3_000)
  })

  it('enabled가 false면 시각을 갱신하지 않는다', async () => {
    const { result } = renderHook(() => useNowTicker(1_000, false))
    const start = result.current

    await advance(5_000)

    expect(result.current).toBe(start)
  })

  it('다시 활성화되면 멈춰 있던 동안 흐른 시간을 즉시 반영한다', async () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useNowTicker(1_000, enabled),
      { initialProps: { enabled: false } },
    )
    const start = result.current

    await advance(10_000)
    expect(result.current).toBe(start)

    // 재활성화 직후 한 주기(1초)를 기다리지 않고 곧바로 최신 시각으로 맞춘다.
    await act(async () => {
      rerender({ enabled: true })
    })

    expect(result.current).toBe(start + 10_000)
  })
})
