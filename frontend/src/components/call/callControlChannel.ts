/**
 * 통화 종료를 상대에게 즉시 알리는 LiveKit **데이터 채널 토픽**이다.
 *
 * 왜 필요한가: 통화 종료 판단의 기준은 서버 상태(`status=ENDED`)이고, 프론트는 그것을 폴링으로
 * 확인한다. 그래서 한쪽이 통화를 끝내면 상대 화면은 다음 폴링 주기까지(최대 1초) 그대로 남아
 * 전환 시점이 어긋난다.
 *
 * 백엔드가 `call_ended` LiveKit data message를 보내 주면 그것을 쓰는 것이 가장 좋지만
 * (서버가 유일한 발신자이므로 신뢰 문제가 없다), 현재 백엔드에는 data message를 보내는 경로가
 * 없다. 그래서 **참가자끼리 종료 사실을 알리는 힌트 채널**을 프론트에서 먼저 만든다.
 *
 * 중요: 이 메시지는 **힌트일 뿐 종료 근거가 아니다.** 받은 쪽은 화면을 바로 정리하지 않고
 * 통화 상태를 즉시 재조회한다. 판단은 언제나 서버가 내리므로, 참가자가 보낸 메시지를 그대로
 * 믿어 통화를 끊는 위험이 없다. 지연만 폴링 주기에서 1회 왕복으로 줄어든다.
 *
 * 백엔드가 같은 이름의 이벤트를 추가하면 payload 형식만 맞추면 되고, 수신 측 코드는 그대로 쓸 수 있다.
 */
export const CALL_CONTROL_DATA_TOPIC = 'call-control'

/** 통화 종료 알림 payload다. 백엔드가 같은 이벤트를 추가할 때를 대비해 snake_case 타입 이름을 맞춘다. */
export type CallEndedSignal = {
  type: 'call_ended'
  /** 어느 통화가 끝났는지다. 팬이 교체되는 팬미팅에서 이전 통화의 알림을 무시하기 위해 쓴다. */
  callSessionId: string
}

/**
 * 통화 종료 알림을 바이트열로 만든다.
 *
 * 반환 타입을 `Uint8Array<ArrayBuffer>`로 좁힌다. `TextEncoder.encode()`의 타입은
 * SharedArrayBuffer 기반 버퍼도 허용해서 LiveKit `publishData`가 요구하는
 * NonSharedUint8Array와 맞지 않는다. 일반 ArrayBuffer로 복사해 그 차이를 없앤다.
 */
export function encodeCallEndedSignal(callSessionId: string): Uint8Array<ArrayBuffer> {
  const signal: CallEndedSignal = { type: 'call_ended', callSessionId }
  return new Uint8Array(new TextEncoder().encode(JSON.stringify(signal)))
}

/**
 * 데이터 채널로 받은 바이트열이 통화 종료 알림인지 확인한다.
 *
 * 알 수 없는 형식이나 다른 종류의 제어 메시지는 조용히 무시한다. 이 채널은 앞으로 다른
 * 이벤트가 추가될 수 있으므로, 모르는 `type`을 오류로 다루지 않는다.
 */
export function parseCallEndedSignal(data: Uint8Array): CallEndedSignal | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(data))
  } catch {
    return undefined
  }

  if (typeof parsed !== 'object' || parsed === null) return undefined
  const record = parsed as Record<string, unknown>
  if (record.type !== 'call_ended') return undefined

  // 세션 식별자는 숫자로 올 수도 있어 문자열로 정규화한다. 프론트는 통화 세션 ID를 문자열로 다룬다.
  const rawId = record.callSessionId ?? record.call_session_id
  if (typeof rawId !== 'string' && typeof rawId !== 'number') return undefined

  return { type: 'call_ended', callSessionId: String(rawId) }
}
