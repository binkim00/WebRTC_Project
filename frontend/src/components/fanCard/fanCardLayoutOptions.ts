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
  { key: 'FOURCUT', label: translate('fanCardLayoutOptions.t3'), photoCount: MAX_PHOTOS_PER_CARD },
  { key: 'FOURCUT_VERTICAL', label: translate('fanCardLayoutOptions.t4'), photoCount: MAX_PHOTOS_PER_CARD },
  { key: 'FOURCUT_HORIZONTAL', label: translate('fanCardLayoutOptions.t5'), photoCount: MAX_PHOTOS_PER_CARD },
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
