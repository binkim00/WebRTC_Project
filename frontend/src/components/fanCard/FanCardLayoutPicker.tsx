import type { FanCardLayout } from './fanCardCanvas'
import { LAYOUT_OPTIONS, photoCountOf } from './fanCardLayoutOptions'

type FanCardLayoutPickerProps = {
  /** 팬이 찍어 둔 사진의 미리보기 주소 */
  photoUrls: readonly string[]
  /** 지금 고른 카드 모양 */
  layout?: FanCardLayout
  /** 카드에 넣기로 한 사진의 위치이며 순서가 곧 칸 순서다 */
  selectedPhotoIndexes: readonly number[]
  /** 카드 모양을 바꿨을 때 호출한다 */
  onLayoutChange: (layout: FanCardLayout | undefined) => void
  /** 사진을 넣거나 뺄 때 호출한다 */
  onTogglePhoto: (index: number) => void
}

/**
 * 카드 모양과 거기에 넣을 사진을 고르는 부분이다.
 *
 * <p>모양마다 쓰는 사진 수가 달라서, 고른 모양에 따라 사진 고르기가 나타나고 몇 장까지
 * 고를 수 있는지도 함께 바뀐다.
 */
export function FanCardLayoutPicker({
  photoUrls,
  layout,
  selectedPhotoIndexes,
  onLayoutChange,
  onTogglePhoto,
}: FanCardLayoutPickerProps) {
  const needed = photoCountOf(layout)

  return (
    <div className="mt-6 border-t border-[var(--color-divider)] pt-6">
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
        카드 모양 고르기
      </h3>
      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
        통화 중에 남긴 사진 {photoUrls.length}장으로 카드를 만들 수 있어요.
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {LAYOUT_OPTIONS.map((option) => (
          <li key={option.label}>
            <button
              aria-pressed={layout === option.key}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-200 motion-reduce:transition-none ${
                layout === option.key
                  ? 'border-[var(--color-primary-coral)] bg-[var(--color-primary-coral-soft)] text-[var(--color-primary-coral)]'
                  : 'border-[var(--color-border-control)] bg-[var(--color-surface-panel)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-page)]'
              }`}
              onClick={() => onLayoutChange(option.key)}
              type="button"
            >
              {option.label}
            </button>
          </li>
        ))}
      </ul>

      {needed > 0 ? (
        <div className="mt-5">
          <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
            사진 고르기
            <span className="ml-2 font-normal text-[var(--color-text-secondary)]">
              {selectedPhotoIndexes.length}/{needed}장 선택
            </span>
          </h4>
          <ul className="mt-3 grid grid-cols-4 gap-2">
            {photoUrls.map((url, index) => {
              const order = selectedPhotoIndexes.indexOf(index)
              const chosen = order >= 0
              return (
                <li key={url}>
                  <button
                    aria-label={`${index + 1}번째 사진${chosen ? ' 선택 해제' : ' 선택'}`}
                    aria-pressed={chosen}
                    className={`relative block w-full overflow-hidden rounded-[var(--radius-control)] border-2 transition-colors duration-200 motion-reduce:transition-none ${
                      chosen
                        ? 'border-[var(--color-primary-coral)]'
                        : 'border-transparent hover:border-[var(--color-border-control)]'
                    }`}
                    onClick={() => onTogglePhoto(index)}
                    type="button"
                  >
                    <img alt="" className="block aspect-video w-full object-cover" src={url} />
                    {/* 네컷은 고른 차례가 곧 칸 순서라 번호를 보여 준다. */}
                    {chosen && needed > 1 ? (
                      <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-[var(--color-primary-coral)] text-[11px] font-bold text-white">
                        {order + 1}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
          {selectedPhotoIndexes.length < needed ? (
            <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
              남은 칸은 빈 자리로 나옵니다. 원하는 사진을 더 골라 주세요.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
