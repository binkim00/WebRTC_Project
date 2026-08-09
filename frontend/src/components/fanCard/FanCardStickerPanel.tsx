import { useState } from 'react'

import { Button, TextField } from '..'
import { selectableChipClass } from './fanCardChipClass'
import {
  CARD_STICKER_CATEGORIES,
  cardStickerUrl,
} from './cardStickers'
import { useTranslation } from '../../i18n'

/** 팬이 조절할 수 있는 스티커·글자 크기 범위다. */
export const MIN_DECORATION_SIZE = 48
export const MAX_DECORATION_SIZE = 420

type FanCardStickerPanelProps = {
  /** 카드에 얹혀 있는 요소 수. 안내 문구를 고르는 데 쓴다. */
  decorationCount: number
  /** 스티커를 골랐을 때 호출한다 */
  onAddSticker: (code: string) => void
  /** 글자를 올릴 때 호출한다 */
  onAddText: (text: string) => void
}

/**
 * 카드 위에 얹을 스티커와 글자를 고르는 부분이다.
 *
 * <p>얹어 둔 요소의 이동·크기·기울기·삭제는 카드 미리보기 위에서 직접 조작한다
 * (끌기와 모서리 핸들). 아래에 조절 바를 따로 두면 시선이 카드와 바 사이를 오가야 해
 * 번거롭기 때문이다. 어느 갈래를 보고 있는지는 화면에서만 쓰는 값이라 이 안에서 들고 있는다.
 */
export function FanCardStickerPanel({
  decorationCount,
  onAddSticker,
  onAddText,
}: FanCardStickerPanelProps) {
  const { t } = useTranslation()
  const [categoryKey, setCategoryKey] = useState(
    CARD_STICKER_CATEGORIES()[0]?.key ?? 'heart',
  )
  const [textInput, setTextInput] = useState('')

  const stickers = CARD_STICKER_CATEGORIES().find(
    (category) => category.key === categoryKey,
  )?.stickers ?? []

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[15px] font-extrabold text-[var(--color-text-primary)]">
           {t('fanCardStickerPanel.t1')} </h4>
        <p className="text-[13px] font-medium text-[var(--color-text-muted)]">
          {decorationCount > 0
            ? t('fanCardStickerPanel.t2')
            : t('fanCardStickerPanel.t3')}
        </p>
      </div>

      <ul className="mt-3 flex flex-wrap gap-2">
        {CARD_STICKER_CATEGORIES().map((category) => (
          <li key={category.key}>
            <button
              aria-pressed={categoryKey === category.key}
              className={selectableChipClass(categoryKey === category.key)}
              onClick={() => setCategoryKey(category.key)}
              type="button"
            >
              {category.label}
            </button>
          </li>
        ))}
      </ul>

      <ul className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-8">
        {stickers.map((sticker) => (
          <li key={sticker.code}>
            <button
              className="block w-full rounded-[var(--radius-control)] p-1.5 transition-colors hover:bg-[var(--color-surface-page)] focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]"
              onClick={() => onAddSticker(sticker.code)}
              title={sticker.name}
              type="button"
            >
              <img
                alt={sticker.name}
                className="block aspect-square w-full"
                decoding="async"
                loading="lazy"
                src={cardStickerUrl(sticker.code)}
              />
            </button>
          </li>
        ))}
      </ul>

      {/* 글자 얹기 — 서비스 공용 입력을 써서 라벨·여백·포커스가 다른 폼과 같게 보이도록 한다. */}
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <TextField
          containerClassName="min-w-0 flex-1"
          label={t('fanCardStickerPanel.t4')}
          maxLength={20}
          onChange={(event) => setTextInput(event.target.value)}
          placeholder={t('fanCardStickerPanel.t5')}
          reserveMessageSpace={false}
          value={textInput}
        />
        <Button
          disabled={!textInput.trim()}
          onClick={() => {
            onAddText(textInput.trim())
            setTextInput('')
          }}
          variant="secondary"
        >
           {t('fanCardStickerPanel.t6')} </Button>
      </div>

    </div>
  )
}
