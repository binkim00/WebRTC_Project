import { useContext } from 'react'
import { I18nContext, type I18nContextValue } from './context'

/**
 * 화면 언어와 번역 함수를 읽는다.
 *
 * Provider 밖에서 부르면 개발 중에 바로 드러나도록 던진다. 조용히 한국어로 되돌리면
 * "번역이 안 되는 화면"의 원인을 찾기 어려워진다.
 *
 * @example
 * const { t, locale, setLocale } = useTranslation()
 * <button>{t('login.submit')}</button>
 */
export function useTranslation(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useTranslation은 I18nProvider 안에서만 사용할 수 있습니다.')
  }

  return context
}
