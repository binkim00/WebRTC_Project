/**
 * 통화 중 이모지 리액션을 상대에게 보내는 LiveKit **데이터 채널 토픽**이다.
 *
 * 왜 필요한가: 팬 1명당 통화가 2분 남짓이라 통화 중에 설정하거나 배워야 하는 기능은 쓰이지 않는다.
 * 이모지는 한 번 누르면 즉시 양쪽 화면에 뜨는 **무설정 상호작용**이라 이 길이에 맞는다.
 *
 * 자막(`subtitle`)·통화 제어(`call-control`)와 같은 방식으로 토픽만 분리한다. LiveKit의 데이터
 * 채널은 토픽별로 독립 구독이므로 서로 간섭하지 않는다.
 *
 * 주의: 리액션은 **표시 전용**이며 어떤 상태도 바꾸지 않는다. 그래서 참가자가 보낸 값을 그대로
 * 믿어도 위험이 없고, 서버를 거치지 않는다. 다만 화면에 그리기 전에 아래 목록에 있는 이모지인지
 * 확인해 임의 문자열이 렌더되지 않게 한다.
 */
export const REACTION_DATA_TOPIC = 'reaction'

/**
 * 보낼 수 있는 리액션 목록이다.
 *
 * 자유 입력을 허용하지 않는 이유는 두 가지다. (1) 2분 통화에서 이모지를 고르는 시간조차 아깝다.
 * (2) 상대 화면에 임의 문자열이 그려지는 경로를 만들지 않는다.
 */
export const REACTION_EMOJIS = ['❤️', '👏', '😍', '🎉', '😂'] as const

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number]

/** 리액션 payload다. 다른 토픽과 같이 `type`으로 종류를 구분한다. */
export type ReactionSignal = {
  type: 'reaction'
  emoji: ReactionEmoji
}

/** 값이 허용된 이모지인지 좁힌다. */
export function isReactionEmoji(value: unknown): value is ReactionEmoji {
  return (
    typeof value === 'string' && (REACTION_EMOJIS as readonly string[]).includes(value)
  )
}

/**
 * 리액션을 바이트열로 만든다.
 *
 * 반환 타입을 `Uint8Array<ArrayBuffer>`로 좁히는 이유는 callControlChannel과 같다.
 * `TextEncoder.encode()`의 타입은 SharedArrayBuffer 기반 버퍼도 허용해서 LiveKit
 * `publishData`가 요구하는 NonSharedUint8Array와 맞지 않는다.
 */
export function encodeReaction(emoji: ReactionEmoji): Uint8Array<ArrayBuffer> {
  const signal: ReactionSignal = { type: 'reaction', emoji }
  return new Uint8Array(new TextEncoder().encode(JSON.stringify(signal)))
}

/**
 * 데이터 채널로 받은 바이트열에서 리액션을 읽는다.
 *
 * 알 수 없는 형식·다른 종류의 메시지·목록에 없는 이모지는 조용히 무시한다. 리액션은 보조
 * 표현이므로 이상한 값이 와도 통화를 방해하지 않는 쪽을 택한다.
 */
export function parseReaction(data: Uint8Array): ReactionSignal | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(data))
  } catch {
    return undefined
  }

  if (typeof parsed !== 'object' || parsed === null) return undefined
  const record = parsed as Record<string, unknown>
  if (record.type !== 'reaction') return undefined
  if (!isReactionEmoji(record.emoji)) return undefined

  return { type: 'reaction', emoji: record.emoji }
}
