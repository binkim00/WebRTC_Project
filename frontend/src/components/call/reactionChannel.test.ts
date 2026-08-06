import { describe, expect, it } from 'vitest'
import {
  REACTION_EMOJIS,
  encodeReaction,
  isReactionEmoji,
  parseReaction,
} from './reactionChannel'

describe('reactionChannel', () => {
  it('보낸 리액션을 그대로 다시 읽는다', () => {
    for (const emoji of REACTION_EMOJIS) {
      expect(parseReaction(encodeReaction(emoji))).toEqual({ type: 'reaction', emoji })
    }
  })

  it('목록에 없는 이모지는 무시한다', () => {
    // 상대 화면에 임의 문자열이 그려지는 경로를 만들지 않는다.
    const payload = new TextEncoder().encode(
      JSON.stringify({ type: 'reaction', emoji: '💀' }),
    )
    expect(parseReaction(payload)).toBeUndefined()
    expect(isReactionEmoji('💀')).toBe(false)
  })

  it('다른 토픽의 메시지나 깨진 payload는 무시한다', () => {
    const otherType = new TextEncoder().encode(
      JSON.stringify({ type: 'call_ended', callSessionId: '7' }),
    )
    expect(parseReaction(otherType)).toBeUndefined()
    expect(parseReaction(new TextEncoder().encode('not json'))).toBeUndefined()
  })
})
