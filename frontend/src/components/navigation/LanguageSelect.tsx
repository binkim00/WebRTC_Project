import { GlobeSimple } from '@phosphor-icons/react'
import { LOCALE_LABELS, SUPPORTED_LOCALES, isLocale, useTranslation } from '../../i18n'

/**
 * 전역 헤더의 화면 언어 선택기다.
 *
 * 고른 언어는 즉시 전체 화면에 적용되고 브라우저에 저장되어 다음 방문에도 유지된다.
 * 계정의 선호 언어(`preferredLanguage`)는 바꾸지 않는다 — 그 값은 통화 자막의 번역 대상
 * 언어로도 쓰이므로 마이페이지에서 따로 변경한다. (I18nProvider 주석 참고)
 *
 * 항목이 두 개뿐이라 커스텀 드롭다운 대신 native select를 쓴다. 키보드·스크린 리더·모바일
 * 기본 UI를 그대로 얻을 수 있고 헤더에서 차지하는 자리도 작다.
 */
export function LanguageSelect({ className }: { className?: string }) {
  const { locale, setLocale, t } = useTranslation()

  return (
    <label className={className}>
      {/* 아이콘만으로는 용도를 알 수 없어 라벨을 두고, 좁은 화면에서는 시각적으로만 숨긴다. */}
      <span className="sr-only">{t('language.change')}</span>
      <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--color-border-control)] px-2.5 py-1.5 transition-colors focus-within:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-within:[outline-offset:var(--focus-ring-offset)] hover:border-[var(--color-text-tertiary)]">
        <GlobeSimple aria-hidden size={16} weight="bold" />
        <select
          className="cursor-pointer appearance-none bg-transparent pr-1 text-sm font-bold text-[var(--color-text-primary)] outline-none"
          onChange={(event) => {
            const next = event.currentTarget.value
            // 규격 밖 값은 무시한다. select이므로 정상 조작에서는 발생하지 않는다.
            if (isLocale(next)) setLocale(next)
          }}
          value={locale}
        >
          {SUPPORTED_LOCALES.map((option) => (
            <option key={option} value={option}>
              {LOCALE_LABELS[option]}
            </option>
          ))}
        </select>
      </span>
    </label>
  )
}
