import { describe, expect, it } from 'vitest'

import { parseServerDate, serverLocalDateTimeMs } from './serverTime'

/**
 * 여기서 검증하는 것은 "브라우저 시간대와 무관하게 같은 순간을 가리키는가"다.
 *
 * 테스트가 KST 환경에서 돌면 잘못된 구현(`new Date(value)`)도 통과한다. 그래서 값 자체를
 * 시간대가 분명한 기준(UTC 에폭)과 비교한다.
 */
describe('serverLocalDateTimeMs', () => {
  it('시간대 표기가 없으면 서버 시간대(KST)로 해석한다', () => {
    // 2026-08-07 19:00 KST = 2026-08-07 10:00 UTC
    expect(serverLocalDateTimeMs('2026-08-07T19:00:00')).toBe(Date.UTC(2026, 7, 7, 10, 0, 0))
  })

  it('초 단위 소수점이 붙어도 같은 규칙으로 해석한다', () => {
    expect(serverLocalDateTimeMs('2026-08-07T19:00:00.500'))
      .toBe(Date.UTC(2026, 7, 7, 10, 0, 0, 500))
  })

  it('Z 표기가 있으면 그대로 UTC로 본다', () => {
    expect(serverLocalDateTimeMs('2026-08-07T10:00:00Z')).toBe(Date.UTC(2026, 7, 7, 10, 0, 0))
  })

  it('오프셋 표기가 있으면 그 오프셋을 따른다', () => {
    expect(serverLocalDateTimeMs('2026-08-07T19:00:00+09:00'))
      .toBe(Date.UTC(2026, 7, 7, 10, 0, 0))
  })

  it('값이 없거나 해석할 수 없으면 NaN이다', () => {
    expect(serverLocalDateTimeMs(undefined)).toBeNaN()
    expect(serverLocalDateTimeMs(null)).toBeNaN()
    expect(serverLocalDateTimeMs('')).toBeNaN()
    expect(serverLocalDateTimeMs('어제')).toBeNaN()
  })
})

describe('parseServerDate', () => {
  it('같은 규칙으로 Date를 만든다', () => {
    expect(parseServerDate('2026-08-07T19:00:00').getTime())
      .toBe(Date.UTC(2026, 7, 7, 10, 0, 0))
  })

  it('잘못된 값은 Invalid Date라 기존 NaN 검사가 그대로 통한다', () => {
    // 화면들은 지금까지 `Number.isNaN(date.getTime())`으로 잘못된 값을 걸러 왔다.
    expect(Number.isNaN(parseServerDate('어제').getTime())).toBe(true)
    expect(Number.isNaN(parseServerDate(null).getTime())).toBe(true)
  })
})
