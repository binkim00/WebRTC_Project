import { useEffect, useState } from 'react'

/**
 * 지정한 주기로 현재 시각(epoch ms)을 다시 읽어 리렌더를 유발한다.
 *
 * 남은 시간, 경과 시간, "시각 경계가 지나면 버튼이 열린다" 같은
 * **시계가 흐르면 화면도 바뀌어야 하는** 파생값 계산에 사용한다.
 * 서버 데이터를 다시 가져오는 목적이라면 대신 {@link usePolling}을 쓴다.
 *
 * 화면마다 `useState(() => Date.now())` + `setInterval(() => setNow(Date.now()))`를
 * 반복 구현하던 것을 하나로 모은 것이다.
 *
 * @param intervalMs 시각을 갱신할 주기(ms). 초 단위 카운트다운은 1_000, 분 경계 판정은 15_000 정도가 적당하다.
 * @param enabled false면 타이머를 멈춘다. 카운트다운이 끝난 뒤 불필요한 리렌더를 막는 데 쓴다.
 * @returns 마지막으로 읽은 `Date.now()` 값
 *
 * @example
 * // 재발송 쿨다운이 남아 있는 동안만 1초 간격으로 갱신한다.
 * const now = useNowTicker(1_000, cooldownActive)
 * const remainingSec = Math.max(0, Math.ceil((cooldownUntil - now) / 1000))
 */
export function useNowTicker(intervalMs: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!enabled) return

    // 타이머가 멈춰 있던 동안 흐른 시간을 즉시 반영한다.
    // 이렇게 하지 않으면 재활성화 직후 한 주기 동안 낡은 시각으로 계산된다.
    setNow(Date.now())

    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [enabled, intervalMs])

  return now
}
