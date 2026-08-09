import { MAX_PHOTOS_PER_CARD } from '../../api/capturedPhotos'
import { translate } from '../../i18n'
import type { FanCardLayout } from './fanCardCanvas'

export type LayoutOption = {
  /** 레이아웃 값이며 undefined는 사진 없는 문구 전용 카드다. */
  key?: FanCardLayout
  label: string
  /** 이 레이아웃이 쓰는 사진 수 */
  photoCount: number
}

/**
 * 팬이 고를 수 있는 카드 모양이다.
 *
 * <p>모양을 고르는 화면과 사진 수를 계산하는 쪽이 함께 쓰므로 컴포넌트 파일 밖에 둔다.
 * 컴포넌트 파일에서 값을 함께 내보내면 개발 중 빠른 새로고침이 동작하지 않는다.
 */
export const LAYOUT_OPTIONS = (): readonly LayoutOption[] => [
  { key: 'INSTA', label: translate('fanCardLayoutOptions.t1'), photoCount: 1 },
  { key: 'POLAROID', label: translate('fanCardLayoutOptions.t2'), photoCount: 1 },
  { key: 'TWOCUT', label: translate('fanCardLayoutOptions.t7'), photoCount: 2 },
  { key: 'FOURCUT', label: translate('fanCardLayoutOptions.t3'), photoCount: 4 },
  { key: 'FOURCUT_VERTICAL', label: translate('fanCardLayoutOptions.t4'), photoCount: 4 },
  { key: 'FOURCUT_HORIZONTAL', label: translate('fanCardLayoutOptions.t5'), photoCount: 4 },
  { key: 'FILM', label: translate('fanCardLayoutOptions.t8'), photoCount: 4 },
  { key: 'SIXCUT', label: translate('fanCardLayoutOptions.t9'), photoCount: MAX_PHOTOS_PER_CARD },
  { key: 'HEART', label: translate('fanCardLayoutOptions.t10'), photoCount: 1 },
  { key: 'SCATTER', label: translate('fanCardLayoutOptions.t12'), photoCount: 3 },
  { key: undefined, label: translate('fanCardLayoutOptions.t6'), photoCount: 0 },
]

/**
 * 레이아웃이 쓰는 사진 수를 알려 준다.
 *
 * @param layout 확인할 레이아웃이며 undefined면 문구 전용이다
 * @returns 필요한 사진 수
 */
export function photoCountOf(layout: FanCardLayout | undefined): number {
  return LAYOUT_OPTIONS().find((option) => option.key === layout)?.photoCount ?? 0
}

/**
 * 카드 칸을 채울 사진 순서를 만든다.
 *
 * <p>찍어 둔 사진이 칸 수보다 적으면 빈 칸을 남기지 않고 같은 사진을 다시 쓴다. 아직 쓰지
 * 않은 사진을 먼저 넣고, 모두 쓰고도 칸이 남으면 앞서 넣은 차례를 그대로 되풀이한다.
 * 사진 두 장으로 네 칸을 채우면 첫째·둘째 사진이 번갈아 들어간다.
 *
 * @param chosen 이미 고른 사진 위치이며 순서가 곧 칸 순서다
 * @param need 이 레이아웃이 쓰는 칸 수
 * @param photoCount 팬이 찍어 둔 사진 장수
 * @returns 칸 순서대로 늘어놓은 사진 위치이며 칸이나 사진이 없으면 빈 배열
 */
export function fillPhotoSlots(
  chosen: readonly number[],
  need: number,
  photoCount: number,
): number[] {
  if (need === 0 || photoCount === 0) return []

  const slots = chosen.slice(0, need)
  while (slots.length < need) {
    let unused: number | undefined
    for (let candidate = 0; candidate < photoCount; candidate += 1) {
      if (!slots.includes(candidate)) {
        unused = candidate
        break
      }
    }
    if (unused !== undefined) {
      slots.push(unused)
      continue
    }
    // 남는 사진이 없다는 것은 모든 사진을 한 번씩 썼다는 뜻이라 photoCount 칸 앞자리는
    // 반드시 채워져 있다. 그 차례를 그대로 되풀이해 사진이 고르게 번갈아 들어가게 한다.
    // 뒤의 0은 타입을 맞추기 위한 값이며 실제로는 여기까지 오지 않는다.
    slots.push(slots[slots.length - photoCount] ?? 0)
  }
  return slots
}
