// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  readCharacterPreference,
  writeCharacterPreference,
} from './characterPreference'
import { CHARACTER_PRESETS } from './characterVideoTrack'

afterEach(() => {
  window.localStorage.clear()
})

describe('characterPreference', () => {
  it('저장한 설정을 그대로 읽는다', () => {
    const presetId = CHARACTER_PRESETS[2].id
    writeCharacterPreference({ enabled: true, presetId })

    expect(readCharacterPreference()).toEqual({ enabled: true, presetId })
  })

  it('저장값이 없으면 캐릭터를 끈 기본값을 준다', () => {
    expect(readCharacterPreference()).toEqual({
      enabled: false,
      presetId: CHARACTER_PRESETS[0].id,
    })
  })

  it('깨진 값이나 모르는 프리셋은 기본값으로 되돌린다', () => {
    // 사용자가 저장소를 직접 고쳤거나 프리셋 목록이 바뀐 뒤에도 화면이 깨지지 않아야 한다.
    window.localStorage.setItem('melly-call-character', 'not json')
    expect(readCharacterPreference().enabled).toBe(false)

    window.localStorage.setItem(
      'melly-call-character',
      JSON.stringify({ enabled: true, presetId: 'no-such-preset' }),
    )
    expect(readCharacterPreference()).toEqual({
      // 켜 둔 선택은 존중하고, 알 수 없는 프리셋만 기본값으로 바꾼다.
      enabled: true,
      presetId: CHARACTER_PRESETS[0].id,
    })
  })
})
