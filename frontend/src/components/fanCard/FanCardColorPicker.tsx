import { translate, useTranslation } from '../../i18n'

/**
 * 색 한 칸의 클래스다.
 *
 * <p>글자 칩과 달리 동그라미만 보여 주므로 좌우 여백이 넓은 공용 칩을 쓰지 않는다. 고른 칸은
 * 테두리를 굵고 진하게 둘러 표시한다. 채움색으로 표시하면 칸 안의 색을 덮어 버린다.
 *
 * @param selected 지금 고른 칸인지
 * @returns 적용할 클래스
 */
function colorChipClass(selected: boolean): string {
  return [
    'grid min-h-9 min-w-9 place-items-center rounded-full border-2 transition-colors',
    'focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]',
    selected
      ? 'border-[var(--color-primary-coral)]'
      : 'border-transparent hover:border-[var(--color-border-control)]',
  ].join(' ')
}

/**
 * 팬이 글자에 쓸 수 있는 색이다.
 *
 * <p>색을 자유롭게 고르게 하면(색상환) 배경과 같은 색을 골라 글자가 사라지거나, 도안과 어울리지
 * 않는 색이 나온다. 여덟 가지로 좁혀 어느 도안에 얹어도 읽히는 색만 남겼다. 값이 없는 첫 칸은
 * 도안이 정한 색을 그대로 쓴다는 뜻이다.
 */
const FAN_CARD_TEXT_COLORS: readonly { value?: string; label: () => string }[] = [
  { value: undefined, label: () => translate('fanCardColorPicker.t1') },
  { value: '#ffffff', label: () => translate('fanCardColorPicker.t2') },
  { value: '#1f2430', label: () => translate('fanCardColorPicker.t3') },
  { value: '#ff5f6d', label: () => translate('fanCardColorPicker.t4') },
  { value: '#ff8fc7', label: () => translate('fanCardColorPicker.t5') },
  { value: '#ffc93c', label: () => translate('fanCardColorPicker.t6') },
  { value: '#2fd6b6', label: () => translate('fanCardColorPicker.t7') },
  { value: '#5b9dff', label: () => translate('fanCardColorPicker.t8') },
  { value: '#a97bff', label: () => translate('fanCardColorPicker.t9') },
]

type FanCardColorPickerProps = {
  /** 무엇의 색인지 알려 주는 이름 */
  label: string
  /** 지금 고른 색이며 없으면 도안 색을 쓴다 */
  value?: string
  /** 색을 골랐을 때 호출한다. 첫 칸을 고르면 undefined 다 */
  onChange: (color?: string) => void
}

/**
 * 글자 색을 고르는 부분이다.
 *
 * <p>색 이름을 글자로 적지 않고 동그라미로 보여 준다. 이름은 화면 낭독기와 도움말에만 쓴다.
 * 색은 눈으로 고르는 것이라 이름을 읽고 고르는 사람은 거의 없다.
 */
export function FanCardColorPicker({ label, value, onChange }: FanCardColorPickerProps) {
  const { t } = useTranslation()

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-xs font-bold text-[var(--color-text-secondary)]">{label}</span>
      <ul className="flex flex-wrap items-center gap-1.5">
        {FAN_CARD_TEXT_COLORS.map((option) => {
          const selected = value === option.value
          return (
            <li key={option.value ?? 'theme'}>
              <button
                aria-label={option.label()}
                aria-pressed={selected}
                className={colorChipClass(selected)}
                onClick={() => onChange(option.value)}
                title={option.label()}
                type="button"
              >
                {/* 도안 색 칸은 칠할 색이 정해져 있지 않아 두 색을 반씩 나눠 표시한다. */}
                <span
                  aria-hidden="true"
                  className="block size-5 rounded-full border border-[var(--color-border-control)]"
                  style={{
                    background:
                      option.value
                      ?? 'linear-gradient(135deg, var(--color-text-primary) 50%, #ffffff 50%)',
                  }}
                />
              </button>
            </li>
          )
        })}
      </ul>
      {value === undefined ? null : (
        <button
          className="mj-font-label whitespace-nowrap rounded-[var(--radius-control)] border border-[var(--color-border-control)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--color-surface-panel)]"
          onClick={() => onChange(undefined)}
          type="button"
        >
          {t('fanCardColorPicker.t10')}
        </button>
      )}
    </div>
  )
}
