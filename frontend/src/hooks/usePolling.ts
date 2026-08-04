import { useEffect } from 'react'

/**
 * 폴링 콜백.
 *
 * 전달받은 `signal`은 폴링이 멈출 때(언마운트, `enabled` 변경, 콜백 교체) abort된다.
 * 콜백 안에서 API를 호출할 때 이 signal을 그대로 넘기고, catch 블록에서는
 * `if (signal.aborted) return`으로 취소된 요청의 에러를 무시해야 한다.
 */
export type PollingCallback = (signal: AbortSignal) => void | Promise<void>

export type UsePollingOptions = {
  /** 이전 실행이 **끝난 뒤** 다음 실행까지 기다릴 시간(ms). */
  intervalMs: number
  /**
   * false면 폴링을 멈춘다. 조건부 폴링에 사용한다.
   * (예: 대기열 오픈 전에는 백엔드가 QUEUE_NOT_INITIALIZED를 반환하므로 폴링하지 않는다.)
   */
  enabled?: boolean
  /** 마운트 및 재활성화 직후 한 번 즉시 실행할지 여부. 기본값 true. */
  immediate?: boolean
  /** 탭이 보이지 않는 동안 실행을 건너뛴다. 볼 수 없는 화면을 갱신하는 요청을 아낀다. */
  pauseWhenHidden?: boolean
  /** 창이 포커스를 받거나 탭이 다시 보이면 주기를 기다리지 않고 즉시 한 번 갱신한다. */
  refreshOnFocus?: boolean
}

/**
 * 주기적으로 비동기 작업을 실행하는 공통 폴링 훅.
 *
 * 이 훅을 쓰기 전에는 대기실·미팅 목록·조직 관리·통화 준비 화면이 각자
 * `setInterval`/`setTimeout` + `AbortController` + cleanup을 직접 구현하고 있었다.
 * 사이트마다 취소 처리와 중복 요청 방어 수준이 달라 아래 문제가 섞여 있었으므로 하나로 모았다.
 *
 * **직렬 폴링(serial polling)**: 이전 실행이 완료된 뒤에야 다음 실행을 예약한다.
 * `setInterval`은 응답을 기다리지 않고 발사하므로 느린 네트워크에서 요청이 겹치고,
 * 늦게 도착한 이전 응답이 최신 상태를 덮어쓸 수 있다(stale write). 이 훅은 그 상황을 만들지 않는다.
 *
 * @param callback 매 주기에 실행할 작업. **`useCallback`으로 메모이즈해야 한다.**
 *                 콜백 identity가 바뀌면 폴링 루프가 재시작되므로, 매 렌더마다 새 함수를
 *                 넘기면 루프가 계속 끊긴다.
 *
 * @example
 * const loadQueue = useCallback(async (signal: AbortSignal) => {
 *   setSnapshot(await getMyQueue(meetingId, token, signal))
 * }, [meetingId, token])
 *
 * usePolling(loadQueue, { intervalMs: 3_000, enabled: isQueueOpen })
 */
export function usePolling(callback: PollingCallback, options: UsePollingOptions): void {
  const {
    intervalMs,
    enabled = true,
    immediate = true,
    pauseWhenHidden = false,
    refreshOnFocus = false,
  } = options

  useEffect(() => {
    if (!enabled) return

    const controller = new AbortController()
    // cleanup 이후에 도착한 타이머 콜백이 다시 실행을 예약하지 못하게 막는 플래그다.
    let active = true
    let timer: number | undefined
    // 포커스 갱신과 주기 실행이 겹쳐 같은 요청이 두 번 나가는 것을 막는다.
    let running = false

    const clearTimer = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer)
        timer = undefined
      }
    }

    const scheduleNext = () => {
      if (!active) return
      clearTimer()
      timer = window.setTimeout(() => void run(), intervalMs)
    }

    const run = async () => {
      // 실행 중이면 건너뛴다. 진행 중인 실행이 끝나면서 다음 주기를 예약하므로 루프는 끊기지 않는다.
      if (!active || running) return

      running = true
      try {
        // 타이머는 계속 돌리되 실행만 건너뛴다. 탭이 다시 보이면 다음 주기에 자연히 갱신된다.
        if (!pauseWhenHidden || document.visibilityState === 'visible') {
          await callback(controller.signal)
        }
      } finally {
        running = false
      }

      scheduleNext()
    }

    if (immediate) void run()
    else scheduleNext()

    // 다른 창에서 상태가 바뀐 뒤 돌아왔을 때 주기를 기다리지 않고 곧바로 반영한다.
    const refresh = () => {
      if (document.visibilityState === 'visible') void run()
    }
    if (refreshOnFocus) {
      window.addEventListener('focus', refresh)
      document.addEventListener('visibilitychange', refresh)
    }

    return () => {
      active = false
      controller.abort()
      clearTimer()
      if (refreshOnFocus) {
        window.removeEventListener('focus', refresh)
        document.removeEventListener('visibilitychange', refresh)
      }
    }
  }, [callback, enabled, immediate, intervalMs, pauseWhenHidden, refreshOnFocus])
}
