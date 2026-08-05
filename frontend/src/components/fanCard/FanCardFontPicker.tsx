import type { FanCardFont } from './fanCardCanvas'

/**
 * 팬이 고를 수 있는 글꼴이다.
 *
 * <p>previewFamily는 버튼 라벨을 그 글꼴로 보여 주기 위한 값이며, 카드에 실제로 쓰는
 * 글꼴은 fanCardCanvas가 키로 정한다. 글꼴 파일은 public/fonts에 있고 index.css의
 * @font-face로 등록해 둔다.
 */
const FONT_OPTIONS: readonly { key: FanCardFont; label: string; previewFamily?: string }[] = [
  { key: 'DEFAULT', label: '기본' },
  { key: 'ROUND', label: '둥글둥글', previewFamily: '"Jua"' },
  { key: 'HANDWRITING', label: '손글씨', previewFamily: '"Gaegu"' },
  { key: 'HEADLINE', label: '또렷하게', previewFamily: '"Do Hyeon"' },
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
  return (
    <>
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">글꼴 고르기</h3>
      <ul className="mt-3 flex flex-wrap gap-2">
        {FONT_OPTIONS.map((option) => (
          <li key={option.key}>
            <button
              aria-pressed={fontKey === option.key}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors duration-200 motion-reduce:transition-none ${
                fontKey === option.key
                  ? 'border-[var(--color-primary-coral)] bg-[var(--color-primary-coral-soft)] text-[var(--color-primary-coral)]'
                  : 'border-[var(--color-border-control)] bg-[var(--color-surface-panel)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-page)]'
              }`}
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
