import type { FanCardLayout } from './fanCardCanvas'
import { selectableChipClass } from './fanCardChipClass'
import { LAYOUT_OPTIONS, photoCountOf } from './fanCardLayoutOptions'
import { useTranslation } from '../../i18n'

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
  const { t } = useTranslation()
  const needed = photoCountOf(layout)

  return (
    <div className="mt-6 border-t border-[var(--color-divider)] pt-6">
      <h3 className="text-[15px] font-extrabold text-[var(--color-text-primary)]">
         {t('fanCardLayoutPicker.t1')} </h3>
      <p className="mt-1.5 text-[13px] font-medium leading-6 text-[var(--color-text-muted)]">
         {t('fanCardLayoutPicker.t2')} {photoUrls.length}{t('fanCardLayoutPicker.t3')} </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {LAYOUT_OPTIONS().map((option) => (
          <li key={option.label}>
            <button
              aria-pressed={layout === option.key}
              className={selectableChipClass(layout === option.key)}
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
          <h4 className="text-[15px] font-extrabold text-[var(--color-text-primary)]">
             {t('fanCardLayoutPicker.t4')} <span className="ml-2 text-[13px] font-semibold text-[var(--color-text-muted)]">
              {selectedPhotoIndexes.length}/{needed}{t('fanCardLayoutPicker.t5')} </span>
          </h4>
          <ul className="mt-3 grid grid-cols-4 gap-2">
            {photoUrls.map((url, index) => {
              // 사진이 칸 수보다 적으면 한 장이 여러 칸에 들어가므로 칸 번호를 모두 모은다.
              const orders = selectedPhotoIndexes.reduce<number[]>((slots, item, slot) => {
                if (item === index) slots.push(slot + 1)
                return slots
              }, [])
              const chosen = orders.length > 0
              return (
                <li key={url}>
                  <button
                    aria-label={t('fanCardLayoutPicker.t6', {
                      p0: index + 1,
                      p1: chosen
                        ? t('fanCardLayoutPicker.t7')
                        : t('fanCardLayoutPicker.t8'),
                    })}
                    aria-pressed={chosen}
                    className={`relative block w-full overflow-hidden rounded-[var(--radius-control)] border-2 transition-colors focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)] ${
                      chosen
                        ? 'border-[var(--color-primary-coral)]'
                        : 'border-[var(--color-divider)] hover:border-[var(--color-text-tertiary)]'
                    }`}
                    onClick={() => onTogglePhoto(index)}
                    type="button"
                  >
                    <img alt="" className="block aspect-video w-full object-cover" src={url} />
                    {/* 네컷은 고른 차례가 곧 칸 순서라 번호를 보여 준다. 한 사진이 여러 칸에
                        들어가면 번호를 함께 적어 어디에 놓였는지 알 수 있게 한다. */}
                    {chosen && needed > 1 ? (
                      <span className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-primary-coral)] px-1.5 text-[11px] font-extrabold text-white">
                        {orders.join('·')}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
          {photoUrls.length < needed ? (
            <p className="mt-2.5 text-[13px] font-medium leading-6 text-[var(--color-text-muted)]">
               {t('fanCardLayoutPicker.t10')} </p>
          ) : selectedPhotoIndexes.length < needed ? (
            <p className="mt-2.5 text-[13px] font-medium leading-6 text-[var(--color-text-muted)]">
               {t('fanCardLayoutPicker.t9')} </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
