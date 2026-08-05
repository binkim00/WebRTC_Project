import { useState } from 'react'

import { Button } from '..'
import {
  CARD_STICKER_CATEGORIES,
  cardStickerName,
  cardStickerUrl,
} from './cardStickers'
import type { CardDecoration } from './fanCardCanvas'

/** 팬이 조절할 수 있는 스티커·글자 크기 범위다. */
export const MIN_DECORATION_SIZE = 48
export const MAX_DECORATION_SIZE = 420

type FanCardStickerPanelProps = {
  /** 카드에 얹혀 있는 요소 수. 안내 문구를 고르는 데 쓴다. */
  decorationCount: number
  /** 지금 고른 요소이며 없으면 조절 부분을 숨긴다 */
  selectedDecoration?: CardDecoration
  /** 스티커를 골랐을 때 호출한다 */
  onAddSticker: (code: string) => void
  /** 글자를 올릴 때 호출한다 */
  onAddText: (text: string) => void
  /** 고른 요소의 크기나 기울기를 바꿀 때 호출한다 */
  onUpdateSelected: (patch: Partial<Pick<CardDecoration, 'size' | 'rotation'>>) => void
  /** 고른 요소를 뗄 때 호출한다 */
  onRemoveSelected: () => void
}

/**
 * 카드 위에 얹을 스티커와 글자를 고르고, 얹어 둔 것을 조절하는 부분이다.
 *
 * <p>어느 갈래를 보고 있는지는 화면에서만 쓰는 값이라 이 안에서 들고 있는다. 실제로 얹힌
 * 요소는 카드를 그리는 쪽이 갖고 있으므로 바꿀 일이 생기면 위로 알린다.
 */
export function FanCardStickerPanel({
  decorationCount,
  selectedDecoration,
  onAddSticker,
  onAddText,
  onUpdateSelected,
  onRemoveSelected,
}: FanCardStickerPanelProps) {
  const [categoryKey, setCategoryKey] = useState(
    CARD_STICKER_CATEGORIES[0]?.key ?? 'heart',
  )
  const [textInput, setTextInput] = useState('')

  const stickers = CARD_STICKER_CATEGORIES.find(
    (category) => category.key === categoryKey,
  )?.stickers ?? []

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
          스티커로 꾸미기
        </h4>
        <p className="text-xs text-[var(--color-text-secondary)]">
          {decorationCount > 0
            ? '카드 위에서 끌어 옮길 수 있어요.'
            : '눌러서 카드에 올려 보세요.'}
        </p>
      </div>

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {CARD_STICKER_CATEGORIES.map((category) => (
          <li key={category.key}>
            <button
              aria-pressed={categoryKey === category.key}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors duration-200 motion-reduce:transition-none ${
                categoryKey === category.key
                  ? 'border-[var(--color-primary-coral)] bg-[var(--color-primary-coral-soft)] text-[var(--color-primary-coral)]'
                  : 'border-[var(--color-border-control)] bg-[var(--color-surface-panel)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-page)]'
              }`}
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
              className="block w-full rounded-[var(--radius-control)] p-1.5 transition-colors duration-200 hover:bg-[var(--color-surface-page)] motion-reduce:transition-none"
              onClick={() => onAddSticker(sticker.code)}
              title={sticker.name}
              type="button"
            >
              <img
                alt={sticker.name}
                className="block aspect-square w-full"
                loading="lazy"
                src={cardStickerUrl(sticker.code)}
              />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          aria-label="카드에 올릴 글자"
          className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-[var(--color-border-control)] bg-[var(--color-surface-panel)] px-3 py-2 text-sm"
          maxLength={20}
          onChange={(event) => setTextInput(event.target.value)}
          placeholder="카드에 올릴 짧은 글자"
          type="text"
          value={textInput}
        />
        <Button
          disabled={!textInput.trim()}
          onClick={() => {
            onAddText(textInput.trim())
            setTextInput('')
          }}
          size="sm"
          variant="secondary"
        >
          글자 올리기
        </Button>
      </div>

      {selectedDecoration ? (
        <div className="mt-4 rounded-[var(--radius-control)] border border-[var(--color-border-control)] bg-[var(--color-surface-panel)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
              {selectedDecoration.kind === 'STICKER'
                ? cardStickerName(selectedDecoration.content)
                : `“${selectedDecoration.content}”`}
              <span className="ml-2 font-normal text-[var(--color-text-secondary)]">
                선택됨
              </span>
            </p>
            <Button onClick={onRemoveSelected} size="sm" variant="secondary">
              떼어내기
            </Button>
          </div>

          <label className="mt-3 block text-xs font-semibold text-[var(--color-text-secondary)]">
            크기
            <input
              className="mt-1 block w-full"
              max={MAX_DECORATION_SIZE}
              min={MIN_DECORATION_SIZE}
              onChange={(event) => onUpdateSelected({ size: Number(event.target.value) })}
              type="range"
              value={selectedDecoration.size}
            />
          </label>

          <label className="mt-2 block text-xs font-semibold text-[var(--color-text-secondary)]">
            기울기
            <input
              className="mt-1 block w-full"
              max={180}
              min={-180}
              onChange={(event) =>
                onUpdateSelected({ rotation: (Number(event.target.value) * Math.PI) / 180 })
              }
              type="range"
              value={Math.round((selectedDecoration.rotation * 180) / Math.PI)}
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}
