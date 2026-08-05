import { describe, expect, it } from 'vitest'
import { encodeCallEndedSignal, parseCallEndedSignal } from './callControlChannel'

/** 데이터 채널로 오는 형태 그대로 인코딩한다. */
function encode(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value))
}

describe('encodeCallEndedSignal / parseCallEndedSignal', () => {
  it('직접 만든 알림을 그대로 되읽는다', () => {
    const parsed = parseCallEndedSignal(encodeCallEndedSignal('42'))

    expect(parsed).toEqual({ type: 'call_ended', callSessionId: '42' })
  })

  it('세션 식별자가 숫자로 와도 문자열로 정규화한다', () => {
    // 프론트는 통화 세션 ID를 문자열로 다루므로 비교가 어긋나지 않게 맞춘다.
    const parsed = parseCallEndedSignal(encode({ type: 'call_ended', callSessionId: 42 }))

    expect(parsed?.callSessionId).toBe('42')
  })

  it('백엔드가 snake_case로 보내도 해석한다', () => {
    const parsed = parseCallEndedSignal(encode({ type: 'call_ended', call_session_id: '7' }))

    expect(parsed?.callSessionId).toBe('7')
  })

  it('다른 종류의 제어 메시지와 손상된 payload는 무시한다', () => {
    // 이 채널에 다른 이벤트가 추가되어도 오류로 다루지 않는다.
    expect(parseCallEndedSignal(encode({ type: 'mute_all' }))).toBeUndefined()
    expect(parseCallEndedSignal(encode({ type: 'call_ended' }))).toBeUndefined()
    expect(parseCallEndedSignal(new TextEncoder().encode('not json'))).toBeUndefined()
  })
})
