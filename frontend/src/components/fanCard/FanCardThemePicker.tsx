import { FAN_CARD_THEMES, type FanCardThemeKey } from './fanCardCanvas'
import { selectableChipClass } from './fanCardChipClass'
import { translate, useTranslation } from '../../i18n'

/**
 * 팬이 고를 수 있는 카드 도안이다.
 *
 * <p>버튼에 그 도안의 배경색을 그대로 칠해, 고르기 전에 분위기를 볼 수 있게 한다. 색 값은
 * fanCardCanvas 의 표에서 그대로 읽으므로 카드와 버튼이 어긋나지 않는다.
 */
const THEME_OPTIONS = (): readonly { key: FanCardThemeKey; label: string }[] => [
  { key: 'PLAIN', label: translate('fanCardThemePicker.t10') },
  { key: 'NIGHT', label: translate('fanCardThemePicker.t1') },
  { key: 'LAVENDER', label: translate('fanCardThemePicker.t2') },
  { key: 'SKY', label: translate('fanCardThemePicker.t3') },
  { key: 'CREAM', label: translate('fanCardThemePicker.t4') },
  { key: 'PEACH', label: translate('fanCardThemePicker.t5') },
  { key: 'MINT', label: translate('fanCardThemePicker.t6') },
  { key: 'SUNSET', label: translate('fanCardThemePicker.t7') },
  { key: 'MONO', label: translate('fanCardThemePicker.t8') },
]

type FanCardThemePickerProps = {
  /** 지금 고른 도안 */
  themeKey: FanCardThemeKey
  /** 도안을 바꿨을 때 호출한다 */
  onChange: (themeKey: FanCardThemeKey) => void
}

/**
 * 카드 도안을 고르는 부분이다.
 *
 * <p>칸 배치와 따로 고르므로 같은 여섯컷을 밤하늘로도, 크림색으로도 뽑을 수 있다.
 */
export function FanCardThemePicker({ themeKey, onChange }: FanCardThemePickerProps) {
  const { t } = useTranslation()

  return (
    <>
      <h3 className="mt-6 text-[15px] font-extrabold text-[var(--color-text-primary)]">
        {t('fanCardThemePicker.t9')}
      </h3>
      <ul className="mt-3 flex flex-wrap gap-2">
        {THEME_OPTIONS().map((option) => {
          const theme = FAN_CARD_THEMES[option.key]
          return (
            <li key={option.key}>
              <button
                aria-pressed={themeKey === option.key}
                className={selectableChipClass(themeKey === option.key)}
                onClick={() => onChange(option.key)}
                type="button"
              >
                <span className="inline-flex items-center gap-2">
                  {/* 도안 배경색을 작은 원으로 미리 보여 준다. */}
                  <span
                    aria-hidden="true"
                    className="size-3.5 rounded-full border border-[var(--color-border-control)]"
                    style={{
                      background: `linear-gradient(135deg, ${theme.background[0]}, ${theme.background[2]})`,
                    }}
                  />
                  {option.label}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}
