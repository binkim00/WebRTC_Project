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
 * 서버가 보낸 두 시각 문자열의 간격(ms)을 구한다. 파싱할 수 없으면 undefined다.
 *
 * `serverNow`·`endsAt`은 타임존 표기가 없는 KST LocalDateTime 문자열이라 `Date.parse`가
 * **브라우저 로컬 타임존**으로 해석한다. 그래서 이 값을 `Date.now()`와 직접 비교하면
 * KST가 아닌 브라우저에서 시각이 크게 어긋난다.
 *
 * 반면 같은 형식의 두 문자열끼리의 **차이**는 양쪽에 같은 오차가 실려 상쇄되므로 안전하다.
 * 이 함수는 그 차이만 계산하며, 절대 시각 비교에는 쓰지 않는다.
 */
function diffMs(from: string, to: string): number | undefined {
  const fromMs = Date.parse(from)
  const toMs = Date.parse(to)
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return undefined
  return toMs - fromMs
}

/**
 * 서버가 알려 준 종료 시각으로 1초 단위 카운트다운을 만든다.
 *
 * 기준은 **서버의 `endsAt - serverNow`**다. 로컬 입장 시각이나 미디어 연결 시각을 쓰지 않으므로
 * 팬·인플루언서가 서로 다른 시점에 입장해도 같은 남은 시간을 본다. 응답을 받은 뒤 흐른 시간만
 * 로컬 시계로 보정하고, 폴링 응답이 새로 오면 그 값으로 다시 맞춘다.
 * (`endsAt`/`serverNow`를 해석할 수 없는 경우에만 서버가 계산해 준 `remainingSec`으로 대체한다.)
 *
 * 서버는 팬과 인플루언서가 모두 Room에 접속한 뒤에야 `endsAt`을 채우므로, 그 전에는
 * `remainingSec`이 0으로 내려온다. 이 값을 그대로 쓰면 통화 시작 전 화면에 00:00이 떠
 * 카운트다운이 고장 난 것처럼 보인다. 그래서 시작 전에는 팬미팅 운영 설정의 통화 시간을
 * 대기 값으로 보여 주고, 실제 카운트다운은 `endsAt`이 정해진 뒤에만 진행한다.
 *
 * 이 훅이 만드는 값은 **표시용**이다. `expired`가 되어도 통화를 끊는 판단은 서버 상태(`ENDED`)를
 * 따른다. (ConnectedCallRoom 참고)
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

  // 응답 시점의 서버 기준 남은 시간이다. 파싱 실패 시에만 서버가 계산한 remainingSec을 쓴다.
  const serverRemainingMs =
    diffMs(status.serverNow, status.endsAt) ?? status.remainingSec * 1000
  const elapsedMs = Math.max(0, now - receivedAt)
  // 올림이라 남은 시간이 실제로 0이 되는 순간에만 expired가 되고, 그전까지는 1초 이상으로 표시된다.
  // 내림을 쓰면 종료 시각보다 최대 1초 먼저 00:00이 떠 서버 상태와 어긋난다.
  const seconds = Math.max(0, Math.ceil((serverRemainingMs - elapsedMs) / 1000))

  return {
    label: formatDuration(seconds),
    seconds,
    counting: true,
    expired: seconds <= 0,
  }
}
