import { useEffect, useState } from 'react'
import type { CallSessionStatusResponse } from '../../api/callSessions'

export type RemainingTime = {
  /** 화면에 그대로 출력하는 mm:ss 표기다. */
  label: string
  /** 남은 초이며 통화 시작 전에는 팬미팅에 설정된 통화 시간이다. */
  seconds: number
  /** 서버가 종료 시각을 확정해 실제 카운트다운이 시작되었는지 여부다. */
  counting: boolean
  /** 카운트다운이 0에 도달했는지 여부이며 시작 전에는 항상 false다. */
  expired: boolean
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/**
 * 서버가 알려 준 남은 시간으로 1초 단위 카운트다운을 만든다.
 *
 * 서버는 팬과 인플루언서가 모두 Room에 접속한 뒤에야 `endsAt`을 채우므로, 그 전에는
 * `remainingSec`이 0으로 내려온다. 이 값을 그대로 쓰면 통화 시작 전 화면에 00:00이 떠
 * 카운트다운이 고장 난 것처럼 보인다. 그래서 시작 전에는 팬미팅 운영 설정의 통화 시간을
 * 대기 값으로 보여 주고, 실제 카운트다운은 `endsAt`이 정해진 뒤에만 진행한다.
 *
 * @param status 서버에서 폴링한 통화 상태
 * @param callDurationSec 팬미팅 운영 설정의 참가자 1인당 통화 시간(초)
 */
export function useRemainingTime(
  status: CallSessionStatusResponse,
  callDurationSec?: number,
): RemainingTime {
  const [receivedAt, setReceivedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const nextNow = Date.now()
    setReceivedAt(nextNow)
    setNow(nextNow)
  }, [status.remainingSec, status.serverNow])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [])

  // 종료 시각이 없으면 아직 통화가 시작되지 않았다는 뜻이라 서버의 남은 시간은 0이다.
  if (!status.endsAt) {
    const pendingSeconds = Math.max(0, callDurationSec ?? 0)
    return {
      label: formatDuration(pendingSeconds),
      seconds: pendingSeconds,
      counting: false,
      expired: false,
    }
  }

  const elapsedSeconds = Math.max(0, Math.floor((now - receivedAt) / 1000))
  const seconds = Math.max(0, status.remainingSec - elapsedSeconds)
  return {
    label: formatDuration(seconds),
    seconds,
    counting: true,
    expired: seconds <= 0,
  }
}
