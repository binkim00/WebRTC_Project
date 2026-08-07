/**
 * 서버가 보낸 시각 문자열을 브라우저 시간대와 무관하게 해석한다.
 *
 * 백엔드는 `LocalDateTime`을 시간대 없이 내려보낸다(`2026-08-07T19:00:00`). 이 문자열을
 * `new Date(value)`에 그대로 넘기면 **브라우저의 시간대**로 해석되므로, KST가 아닌 환경에서는
 * 같은 값이 다른 순간을 가리킨다. 해외에서 접속한 팬에게 팬미팅 시각이 몇 시간씩 밀려 보이고
 * D-Day와 '오늘' 판정도 하루씩 어긋난다.
 *
 * 서버 시각을 다루는 곳은 예외 없이 이 모듈을 거친다. 한 화면에서 두 방식을 섞으면 같은 값이
 * 자리마다 다르게 보인다.
 */

/** 서버 시간대다. 백엔드 Clock(`Asia/Seoul`)과 같은 값이어야 한다. */
const SERVER_UTC_OFFSET = '+09:00'

/** 문자열 끝에 시간대 표기(Z 또는 ±hh:mm)가 붙어 있는지 판단한다. */
const HAS_OFFSET_PATTERN = /(?:Z|[+-]\d{2}:?\d{2})$/i

/**
 * 서버가 보낸 시각 문자열을 밀리초로 바꾼다.
 *
 * 시간대 표기가 이미 있으면 그대로 믿고, 없으면 서버 시간대로 본다.
 *
 * @param value 서버가 보낸 시각 문자열이며 없을 수 있다
 * @returns 에폭 밀리초이며 값이 없거나 해석할 수 없으면 NaN
 */
export function serverLocalDateTimeMs(value?: string | null): number {
  if (!value) return Number.NaN
  const hasOffset = HAS_OFFSET_PATTERN.test(value)
  return new Date(hasOffset ? value : `${value}${SERVER_UTC_OFFSET}`).getTime()
}

/**
 * 서버가 보낸 시각 문자열을 Date로 바꾼다.
 *
 * 해석할 수 없는 값은 Invalid Date가 되므로, 호출 쪽은 지금까지처럼
 * `Number.isNaN(date.getTime())`으로 확인하면 된다.
 *
 * @param value 서버가 보낸 시각 문자열이며 없을 수 있다
 * @returns 해석한 Date이며 값이 없거나 잘못되면 Invalid Date
 */
export function parseServerDate(value?: string | null): Date {
  return new Date(serverLocalDateTimeMs(value))
}
