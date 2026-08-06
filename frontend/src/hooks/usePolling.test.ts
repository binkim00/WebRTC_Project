// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePolling } from './usePolling'

/** 호출자가 임의 시점에 완료시킬 수 있는 폴링 콜백을 만든다. */
function deferredCallback() {
  let resolveCurrent: (() => void) | undefined
  const signals: AbortSignal[] = []

  const callback = vi.fn((signal: AbortSignal) => {
    signals.push(signal)
    return new Promise<void>((resolve) => {
      resolveCurrent = resolve
    })
  })

  return {
    callback,
    signals,
    /** 진행 중인 실행을 완료시키고 후속 예약이 걸릴 때까지 마이크로태스크를 흘린다. */
    async finish() {
      resolveCurrent?.()
      await vi.advanceTimersByTimeAsync(0)
    },
  }
}

describe('usePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('마운트 직후 한 번 실행하고 주기마다 반복한다', async () => {
    const callback = vi.fn(() => Promise.resolve())

    renderHook(() => usePolling(callback, { intervalMs: 1_000 }))

    expect(callback).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(3_000)

    expect(callback).toHaveBeenCalledTimes(4)
  })

  it('이전 실행이 끝나기 전에는 다음 실행을 예약하지 않는다(직렬 폴링)', async () => {
    const { callback, finish } = deferredCallback()

    renderHook(() => usePolling(callback, { intervalMs: 1_000 }))

    expect(callback).toHaveBeenCalledTimes(1)

    // 첫 실행이 3초 넘게 걸려도 주기마다 요청이 겹쳐 나가지 않는다.
    // setInterval을 쓰던 이전 구현에서는 이 지점에서 3~4번 호출됐고,
    // 늦게 도착한 응답이 최신 상태를 덮어쓸 수 있었다.
    await vi.advanceTimersByTimeAsync(3_500)
    expect(callback).toHaveBeenCalledTimes(1)

    // 실행이 끝난 시점부터 다음 주기를 센다.
    await finish()
    expect(callback).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('immediate가 false면 첫 실행을 한 주기 뒤로 미룬다', async () => {
    const callback = vi.fn(() => Promise.resolve())

    renderHook(() => usePolling(callback, { intervalMs: 1_000, immediate: false }))

    expect(callback).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(999)
    expect(callback).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('enabled가 false면 폴링하지 않고 true로 바뀌면 시작한다', async () => {
    const callback = vi.fn(() => Promise.resolve())

    const { rerender } = renderHook(
      ({ enabled }) => usePolling(callback, { intervalMs: 1_000, enabled }),
      { initialProps: { enabled: false } },
    )

    await vi.advanceTimersByTimeAsync(5_000)
    expect(callback).not.toHaveBeenCalled()

    rerender({ enabled: true })
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('언마운트하면 진행 중인 요청을 취소하고 이후 주기를 멈춘다', async () => {
    const { callback, signals } = deferredCallback()

    const { unmount } = renderHook(() => usePolling(callback, { intervalMs: 1_000 }))

    expect(signals[0]?.aborted).toBe(false)

    unmount()

    expect(signals[0]?.aborted).toBe(true)

    await vi.advanceTimersByTimeAsync(5_000)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('pauseWhenHidden이면 보이지 않는 탭에서 실행을 건너뛴다', async () => {
    const visibility = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden')
    const callback = vi.fn(() => Promise.resolve())

    renderHook(() => usePolling(callback, { intervalMs: 1_000, pauseWhenHidden: true }))

    await vi.advanceTimersByTimeAsync(3_000)
    expect(callback).not.toHaveBeenCalled()

    // 타이머는 계속 돌고 있으므로 탭이 다시 보이면 다음 주기에 갱신이 재개된다.
    visibility.mockReturnValue('visible')
    await vi.advanceTimersByTimeAsync(1_000)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('refreshOnFocus면 주기를 기다리지 않고 포커스 시점에 갱신한다', async () => {
    const callback = vi.fn(() => Promise.resolve())

    renderHook(() =>
      usePolling(callback, {
        intervalMs: 10_000,
        immediate: false,
        refreshOnFocus: true,
      }),
    )

    expect(callback).not.toHaveBeenCalled()

    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('refreshOnFocus가 꺼져 있으면 포커스에 반응하지 않는다', async () => {
    const callback = vi.fn(() => Promise.resolve())

    renderHook(() => usePolling(callback, { intervalMs: 10_000, immediate: false }))

    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)

    expect(callback).not.toHaveBeenCalled()
  })
})
