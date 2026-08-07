import { describe, expect, it } from 'vitest'
import {
  PHOTO_SHUTTER_COUNT_FROM,
  PHOTO_SHUTTER_STEP_MS,
  encodePhotoShutterSignal,
  parsePhotoShutterSignal,
} from './photoShutterChannel'

describe('photoShutterChannel', () => {
  /** 보낸 신호를 받는 쪽에서 그대로 복원하는지 확인한다. */
  it('보낸 셔터 신호를 그대로 다시 읽는다', () => {
    expect(parsePhotoShutterSignal(encodePhotoShutterSignal('91'))).toEqual({
      type: 'photo_shutter',
      callSessionId: '91',
    })
  })

  /** 백엔드가 같은 이벤트를 숫자 ID·snake_case로 보내도 받아들이는지 확인한다. */
  it('숫자 ID와 snake_case 필드도 문자열 세션 ID로 정규화한다', () => {
    const payload = new TextEncoder().encode(
      JSON.stringify({ type: 'photo_shutter', call_session_id: 91 }),
    )
    expect(parsePhotoShutterSignal(payload)).toEqual({
      type: 'photo_shutter',
      callSessionId: '91',
    })
  })

  /** 다른 토픽의 메시지가 섞여 들어와도 카운트다운이 뜨지 않아야 한다. */
  it('다른 종류의 메시지나 깨진 payload는 무시한다', () => {
    const otherType = new TextEncoder().encode(
      JSON.stringify({ type: 'call_ended', callSessionId: '91' }),
    )
    expect(parsePhotoShutterSignal(otherType)).toBeUndefined()

    const noSessionId = new TextEncoder().encode(JSON.stringify({ type: 'photo_shutter' }))
    expect(parsePhotoShutterSignal(noSessionId)).toBeUndefined()

    expect(parsePhotoShutterSignal(new TextEncoder().encode('not json'))).toBeUndefined()
  })

  /** 3·2·1을 보여 주되 실제 대기는 2초 남짓이어야 한다는 것이 이 기능의 요구사항이다. */
  it('카운트다운 전체 길이가 2초 남짓이다', () => {
    const totalMs = PHOTO_SHUTTER_COUNT_FROM * PHOTO_SHUTTER_STEP_MS
    expect(PHOTO_SHUTTER_COUNT_FROM).toBe(3)
    expect(totalMs).toBeGreaterThanOrEqual(1_500)
    expect(totalMs).toBeLessThanOrEqual(2_400)
  })
})
