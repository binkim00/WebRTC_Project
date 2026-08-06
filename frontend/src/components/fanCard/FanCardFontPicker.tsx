import type { FanCardFont } from './fanCardCanvas'
import { selectableChipClass } from './fanCardChipClass'
import { translate, useTranslation } from '../../i18n'

/**
 * 팬이 고를 수 있는 글꼴이다.
 *
 * <p>previewFamily는 버튼 라벨을 그 글꼴로 보여 주기 위한 값이며, 카드에 실제로 쓰는
 * 글꼴은 fanCardCanvas가 키로 정한다. 글꼴 파일은 public/fonts에 있고 index.css의
 * @font-face로 등록해 둔다.
 */
const FONT_OPTIONS = (): readonly { key: FanCardFont; label: string; previewFamily?: string }[] => [
  { key: 'DEFAULT', label: translate('fanCardFontPicker.t1') },
  { key: 'ROUND', label: translate('fanCardFontPicker.t2'), previewFamily: '"Jua"' },
  { key: 'HANDWRITING', label: translate('fanCardFontPicker.t3'), previewFamily: '"Gaegu"' },
  { key: 'HEADLINE', label: translate('fanCardFontPicker.t4'), previewFamily: '"Do Hyeon"' },
  { key: 'IMPACT', label: translate('fanCardFontPicker.t6'), previewFamily: '"Black Han Sans"' },
  { key: 'SOFT', label: translate('fanCardFontPicker.t7'), previewFamily: '"Dongle"' },
  { key: 'CUTE', label: translate('fanCardFontPicker.t8'), previewFamily: '"Hi Melody"' },
]

type FanCardFontPickerProps = {
  /** 지금 고른 글꼴 */
  fontKey: FanCardFont
  /** 글꼴을 바꿨을 때 호출한다 */
  onChange: (fontKey: FanCardFont) => void
}

/**
 * 카드 글꼴을 고르는 부분이다.
 *
 * <p>버튼 라벨 자체를 그 글꼴로 그려, 고르기 전에 모양을 볼 수 있게 한다.
 */
export function FanCardFontPicker({ fontKey, onChange }: FanCardFontPickerProps) {
  const { t } = useTranslation()
  return (
    <>
      <h3 className="text-[15px] font-extrabold text-[var(--color-text-primary)]">{t('fanCardFontPicker.t5')}</h3>
      <ul className="mt-3 flex flex-wrap gap-2">
        {FONT_OPTIONS().map((option) => (
          <li key={option.key}>
            <button
              aria-pressed={fontKey === option.key}
              className={selectableChipClass(fontKey === option.key)}
              onClick={() => onChange(option.key)}
              style={option.previewFamily ? { fontFamily: option.previewFamily } : undefined}
              type="button"
            >
              {option.label}
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
