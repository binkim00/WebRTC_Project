import { DICTIONARIES, type Locale, type TranslationKey } from './locales'

/**
 * 컴포넌트 밖에서 쓰는 번역 함수다.
 *
 * `useTranslation()`은 훅이라 컴포넌트 안에서만 쓸 수 있는데, 화면에 나가는 문장 중 상당수는
 * 컴포넌트 밖에 있다. 상태 라벨 맵, 날짜·시간 포맷 헬퍼, API 계층의 오류 메시지 기본값 같은 것들이다.
 * 그것들까지 번역하려면 훅 없이 현재 언어를 읽을 수 있어야 한다.
 *
 * **사용 규칙**: 반드시 *호출 시점*에 평가되는 자리에서만 쓴다. 함수 본문 안이면 안전하다.
 * 모듈 최상단 상수의 초기값으로 쓰면 import 시점의 언어로 굳어져 언어를 바꿔도 따라오지 않는다.
 * 그런 자리는 값을 만들어 주는 함수로 바꿔서(`const labels = () => ({...})`) 호출 시점에 평가되게 한다.
 */

/**
 * 현재 화면 언어다. `I18nProvider`가 렌더할 때마다 맞춰 준다.
 *
 * Provider 상태와 별도로 모듈 변수를 두는 이유는 훅 밖에서 읽어야 하기 때문이다. 값을 바꾸는 쪽은
 * Provider 하나뿐이므로 두 값이 갈라질 여지는 없다.
 */
let activeLocale: Locale = 'ko'

/** Provider 전용이다. 화면 언어가 바뀔 때 모듈 변수에도 반영한다. */
export function setActiveLocale(locale: Locale): void {
  activeLocale = locale
}

/** 현재 화면 언어를 읽는다. 훅을 쓸 수 없는 자리에서 언어별 분기가 필요할 때 쓴다. */
export function getActiveLocale(): Locale {
  return activeLocale
}

/**
 * 사전에서 문장을 찾는다. `useTranslation().t`와 같은 규칙이다.
 *
 * `{name}` 자리표시자를 params 값으로 바꾸고, 선택한 언어에 키가 없으면 한국어로, 한국어에도
 * 없으면 키를 그대로 돌려준다.
 */
export function translate(
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  const template =
    DICTIONARIES[activeLocale][key] ?? DICTIONARIES.ko[key] ?? key
  if (!params) return template

  return Object.entries(params).reduce(
    (text, [name, replacement]) => text.replaceAll(`{${name}}`, String(replacement)),
    template,
  )
}
