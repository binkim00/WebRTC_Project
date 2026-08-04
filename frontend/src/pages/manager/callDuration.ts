/**
 * 1인 통화 시간(`callDurationSec`) 입력을 다루는 공용 헬퍼다.
 *
 * 백엔드 제약은 `@NotNull @Positive Integer` 하나뿐이라 양의 정수면 무엇이든 받는다.
 * 그래서 아래 상·하한은 서버 규칙이 아니라 **운영자 오기재를 막는 화면 가드레일**이다.
 * 서버가 더 넓은 값을 허용하므로, 여기서 막더라도 API로 들어온 값은 그대로 표시해야 한다.
 *
 * 저장 단위는 서버와 같은 **초**로 유지하고, 입력 화면에서만 분으로 환산한다.
 * (폼 상태를 분으로 바꾸면 수정 폼의 dirty 추적과 서버 값 비교가 모두 어긋난다.)
 */

/** 화면에서 허용하는 최소 통화 시간(분)이다. */
export const CALL_DURATION_MIN_MINUTES = 1

/** 화면에서 허용하는 최대 통화 시간(분)이다. */
export const CALL_DURATION_MAX_MINUTES = 60

const SECONDS_PER_MINUTE = 60

/**
 * 초 단위 값을 분 단위 입력값 문자열로 바꾼다.
 *
 * 60의 배수가 아니면(예: API로 90초가 들어온 경우) `1.5`처럼 소수로 보여 준다.
 * 임의로 반올림하면 저장된 값과 화면이 어긋나므로 실제 값을 그대로 노출한다.
 */
export function callDurationSecToMinutesInput(seconds: number): string {
  if (!Number.isFinite(seconds)) return ''
  return String(seconds / SECONDS_PER_MINUTE)
}

/**
 * 분 단위 입력값을 초로 바꾼다.
 *
 * 입력 중인 빈 문자열이나 숫자가 아닌 값은 `undefined`로 돌려주어
 * 호출부가 "아직 입력 중"과 "잘못된 값"을 구분할 수 있게 한다.
 */
export function minutesInputToCallDurationSec(value: string): number | undefined {
  if (value.trim() === '') return undefined
  const minutes = Number(value)
  if (!Number.isFinite(minutes)) return undefined
  return Math.round(minutes * SECONDS_PER_MINUTE)
}

/**
 * 통화 시간이 저장 가능한 값인지 검사한다.
 *
 * @returns 문제가 없으면 `undefined`, 있으면 사용자에게 보여 줄 메시지
 */
export function validateCallDurationSec(seconds: number | undefined): string | undefined {
  if (seconds === undefined || !Number.isFinite(seconds)) {
    return '1인 통화 시간을 입력해 주세요.'
  }
  if (!Number.isInteger(seconds) || seconds <= 0) {
    return '1인 통화 시간은 0보다 큰 값이어야 합니다.'
  }
  if (seconds < CALL_DURATION_MIN_MINUTES * SECONDS_PER_MINUTE) {
    return `1인 통화 시간은 ${CALL_DURATION_MIN_MINUTES}분 이상으로 입력해 주세요.`
  }
  if (seconds > CALL_DURATION_MAX_MINUTES * SECONDS_PER_MINUTE) {
    return `1인 통화 시간은 ${CALL_DURATION_MAX_MINUTES}분 이하로 입력해 주세요.`
  }
  return undefined
}

/** 확인 화면에서 쓸 사람이 읽기 쉬운 표기를 만든다. (예: 90 → "1분 30초") */
export function formatCallDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '미설정'

  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE)
  const restSeconds = Math.round(seconds % SECONDS_PER_MINUTE)

  if (minutes === 0) return `${restSeconds}초`
  if (restSeconds === 0) return `${minutes}분`
  return `${minutes}분 ${restSeconds}초`
}
