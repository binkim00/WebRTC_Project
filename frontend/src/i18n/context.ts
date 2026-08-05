import { createContext } from 'react'
import type { Locale, TranslationKey } from './locales'

export type I18nContextValue = {
  locale: Locale
  setLocale: (next: Locale) => void
  /**
   * 사전에서 문장을 찾는다.
   *
   * `{name}` 형태의 자리표시자를 params 값으로 바꾼다. 선택한 언어에 키가 없으면 한국어 문장으로,
   * 한국어에도 없으면 키 자체를 돌려준다(화면이 비지 않게 하고 누락을 눈에 띄게 한다).
   */
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}

/**
 * 화면 언어 컨텍스트다.
 *
 * Provider(컴포넌트)와 다른 파일에 두는 이유: 한 파일이 컴포넌트와 컨텍스트를 함께 내보내면
 * Vite의 Fast Refresh가 그 파일을 갱신할 때 상태를 보존하지 못한다.
 */
export const I18nContext = createContext<I18nContextValue | undefined>(undefined)
