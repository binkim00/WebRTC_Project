import { describe, expect, it } from 'vitest'
import {
  CALL_DURATION_MAX_MINUTES,
  CALL_DURATION_MIN_MINUTES,
  callDurationSecToMinutesInput,
  formatCallDuration,
  minutesInputToCallDurationSec,
  validateCallDurationSec,
} from './callDuration'

describe('callDurationSecToMinutesInput', () => {
  it('초를 분 단위 입력값으로 바꾼다', () => {
    expect(callDurationSecToMinutesInput(300)).toBe('5')
    expect(callDurationSecToMinutesInput(60)).toBe('1')
  })

  it('60의 배수가 아니면 반올림하지 않고 실제 값을 보여 준다', () => {
    // 임의로 다듬으면 저장된 값과 화면이 어긋나므로 90초는 1.5분으로 노출한다.
    expect(callDurationSecToMinutesInput(90)).toBe('1.5')
  })
})

describe('minutesInputToCallDurationSec', () => {
  it('분 입력값을 초로 바꾼다', () => {
    expect(minutesInputToCallDurationSec('5')).toBe(300)
    expect(minutesInputToCallDurationSec('1.5')).toBe(90)
  })

  it('입력 중인 빈 값과 숫자가 아닌 값은 undefined로 구분한다', () => {
    expect(minutesInputToCallDurationSec('')).toBeUndefined()
    expect(minutesInputToCallDurationSec('   ')).toBeUndefined()
    expect(minutesInputToCallDurationSec('abc')).toBeUndefined()
  })
})

describe('validateCallDurationSec', () => {
  it('허용 범위 안의 값은 통과시킨다', () => {
    expect(validateCallDurationSec(CALL_DURATION_MIN_MINUTES * 60)).toBeUndefined()
    expect(validateCallDurationSec(CALL_DURATION_MAX_MINUTES * 60)).toBeUndefined()
    expect(validateCallDurationSec(300)).toBeUndefined()
  })

  it('값이 없으면 입력을 요구한다', () => {
    expect(validateCallDurationSec(undefined)).toBe('1인 통화 시간을 입력해 주세요.')
  })

  it('0 이하는 거부한다', () => {
    // 백엔드도 @Positive라서 0과 음수는 어차피 400이 된다.
    expect(validateCallDurationSec(0)).toBeDefined()
    expect(validateCallDurationSec(-60)).toBeDefined()
  })

  it('화면 가드레일 범위를 벗어나면 거부한다', () => {
    expect(validateCallDurationSec(30)).toContain(`${CALL_DURATION_MIN_MINUTES}분 이상`)
    expect(validateCallDurationSec((CALL_DURATION_MAX_MINUTES + 1) * 60)).toContain(
      `${CALL_DURATION_MAX_MINUTES}분 이하`,
    )
  })
})

describe('formatCallDuration', () => {
  it('분 단위로 딱 맞으면 분만 보여 준다', () => {
    expect(formatCallDuration(300)).toBe('5분')
  })

  it('초가 남으면 분과 초를 함께 보여 준다', () => {
    expect(formatCallDuration(90)).toBe('1분 30초')
  })

  it('1분 미만이면 초만 보여 준다', () => {
    expect(formatCallDuration(45)).toBe('45초')
  })

  it('값이 없거나 0 이하면 미설정으로 표시한다', () => {
    expect(formatCallDuration(0)).toBe('미설정')
    expect(formatCallDuration(Number.NaN)).toBe('미설정')
  })
})
