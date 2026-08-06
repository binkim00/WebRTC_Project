import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { I18nContext, type I18nContextValue } from './context'
import { DICTIONARIES, LOCALE_HTML_LANG, isLocale, type Locale } from './locales'
import { setActiveLocale } from './translate'

/** 선택한 화면 언어를 보관하는 키다. 탭을 닫아도 유지되어야 하므로 localStorage를 쓴다. */
const STORAGE_KEY = 'melly-locale'

/** 브라우저 저장값을 읽는다. 사파리 프라이빗 모드처럼 접근이 막히면 undefined다. */
function readStoredLocale(): Locale | undefined {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isLocale(stored) ? stored : undefined
  } catch {
    return undefined
  }
}

/**
 * 처음 보여 줄 언어를 정한다.
 *
 * 우선순위는 (1) 사용자가 직접 고른 값, (2) 브라우저 언어, (3) 한국어다.
 *
 * 계정의 `preferredLanguage`를 쓰지 않는 이유: 로그인 응답에는 그 필드가 없어(`LoginResponse`는
 * 토큰·역할·닉네임만 준다) 첫 렌더 시점에 알 수 없다. 프로필을 따로 조회해 맞추는 방법도 있지만,
 * 화면 언어가 뒤늦게 한 번 바뀌어 깜빡이게 되므로 사용자가 직접 고른 값을 우선한다.
 */
function resolveInitialLocale(): Locale {
  const stored = readStoredLocale()
  if (stored) return stored

  return window.navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'ko'
}

/**
 * 화면 언어를 공급한다.
 *
 * **주의**: 여기서 고르는 언어는 화면 표시 전용이며, 계정의 `preferredLanguage`를 바꾸지 않는다.
 * 그 값은 통화 자막의 STT·번역 대상 언어(`fan_lang`·`influencer_lang`)로도 쓰이므로, 화면을
 * 잠깐 영어로 보는 것과 통화 번역 언어를 바꾸는 것은 구분해야 한다.
 * 계정 선호 언어는 마이페이지에서 따로 변경한다.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(resolveInitialLocale)

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // 저장이 막힌 브라우저에서도 이번 세션 동안은 선택이 유지된다.
    }
  }, [])

  // 스크린 리더 발음과 브라우저 번역 판단이 실제 화면 언어를 따라가게 한다.
  useEffect(() => {
    document.documentElement.lang = LOCALE_HTML_LANG[locale]
  }, [locale])

  // 컴포넌트 밖에서 쓰는 translate()가 같은 언어를 보게 맞춘다.
  // useEffect가 아니라 렌더 중에 맞추는 이유: effect는 자식 렌더 뒤에 실행되므로, 언어를 바꾼
  // 직후 첫 렌더에서 자식이 이전 언어의 문장을 읽게 된다. 대입은 부수효과가 없어 안전하다.
  setActiveLocale(locale)

  const value = useMemo<I18nContextValue>(() => {
    const dictionary = DICTIONARIES[locale]
    const fallback = DICTIONARIES.ko

    return {
      locale,
      setLocale,
      t(key, params) {
        const template = dictionary[key] ?? fallback[key] ?? key
        if (!params) return template

        return Object.entries(params).reduce(
          (text, [name, replacement]) => text.replaceAll(`{${name}}`, String(replacement)),
          template,
        )
      },
    }
  }, [locale, setLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
