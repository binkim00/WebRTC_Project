import { translate } from '../../i18n'
/**
 * 기념 카드에 붙일 수 있는 스티커 목록이다.
 *
 * <p>그림은 Noto Emoji(SIL Open Font License 1.1)의 SVG를 public/stickers에 두고 쓴다.
 * 라이선스 사본은 public/stickers/LICENSE.txt에 있다. 이모지 글자를 그리지 않고 SVG를
 * 쓰는 이유는, 이모지 글꼴이 기기마다 달라 같은 카드가 사람마다 다르게 저장되기 때문이다.
 *
 * <p>종류를 늘리려면 SVG 파일을 public/stickers에 추가하고 아래 목록에 코드와 이름만
 * 더하면 된다.
 */

/** 스티커 하나의 정의다. code는 파일 이름이자 식별자다. */
export type CardSticker = {
  /** 유니코드 코드포인트를 소문자 16진수로 쓴 값이며 파일 이름과 같다. */
  code: string
  /** 읽어 주는 이름이며 버튼 라벨과 대체 텍스트로 쓴다. */
  name: string
}

/** 팔레트에서 탭 하나로 묶이는 스티커 묶음이다. */
export type CardStickerCategory = {
  key: string
  label: string
  stickers: readonly CardSticker[]
}

export const CARD_STICKER_CATEGORIES = (): readonly CardStickerCategory[] => [
  {
    key: 'heart',
    label: translate('cardStickers.t1'),
    stickers: [
      { code: '2764', name: translate('cardStickers.t2') },
      { code: '1f496', name: translate('cardStickers.t3') },
      { code: '1f497', name: translate('cardStickers.t4') },
      { code: '1f49e', name: translate('cardStickers.t5') },
      { code: '1f498', name: translate('cardStickers.t6') },
      { code: '1f9e1', name: translate('cardStickers.t7') },
      { code: '1f49b', name: translate('cardStickers.t8') },
      { code: '1f49a', name: translate('cardStickers.t9') },
      { code: '1f499', name: translate('cardStickers.t10') },
      { code: '1f49c', name: translate('cardStickers.t11') },
      { code: '1f90d', name: translate('cardStickers.t12') },
      { code: '1f5a4', name: translate('cardStickers.t13') },
    ],
  },
  {
    key: 'sparkle',
    label: translate('cardStickers.t14'),
    stickers: [
      { code: '2728', name: translate('cardStickers.t15') },
      { code: '1f4ab', name: translate('cardStickers.t16') },
      { code: '1f31f', name: translate('cardStickers.t17') },
      { code: '2b50', name: translate('cardStickers.t18') },
      { code: '1f389', name: translate('cardStickers.t19') },
      { code: '1f38a', name: translate('cardStickers.t20') },
      { code: '1f388', name: translate('cardStickers.t21') },
      { code: '1f381', name: translate('cardStickers.t22') },
      { code: '1f451', name: translate('cardStickers.t23') },
      { code: '1f3c6', name: translate('cardStickers.t24') },
      { code: '1f3f5', name: translate('cardStickers.t25') },
      { code: '1f52e', name: translate('cardStickers.t26') },
    ],
  },
  {
    key: 'face',
    label: translate('cardStickers.t27'),
    stickers: [
      { code: '1f60d', name: translate('cardStickers.t28') },
      { code: '1f970', name: translate('cardStickers.t29') },
      { code: '1f929', name: translate('cardStickers.t30') },
      { code: '1f973', name: translate('cardStickers.t31') },
      { code: '1f618', name: translate('cardStickers.t32') },
      { code: '1f60a', name: translate('cardStickers.t33') },
      { code: '1f602', name: translate('cardStickers.t34') },
      { code: '1f605', name: translate('cardStickers.t35') },
      { code: '1f92d', name: translate('cardStickers.t36') },
      { code: '1f917', name: translate('cardStickers.t37') },
      { code: '1f97a', name: translate('cardStickers.t38') },
      { code: '1f622', name: translate('cardStickers.t39') },
      { code: '1f631', name: translate('cardStickers.t40') },
      { code: '1f60e', name: translate('cardStickers.t41') },
    ],
  },
  {
    key: 'hand',
    label: translate('cardStickers.t42'),
    stickers: [
      { code: '1f44d', name: translate('cardStickers.t43') },
      { code: '1f44f', name: translate('cardStickers.t44') },
      { code: '1f64c', name: translate('cardStickers.t45') },
      { code: '270c', name: translate('cardStickers.t46') },
      { code: '1f91f', name: translate('cardStickers.t47') },
      { code: '1f90c', name: translate('cardStickers.t48') },
      { code: '1f44b', name: translate('cardStickers.t49') },
      { code: '1f64f', name: translate('cardStickers.t50') },
      { code: '1f91d', name: translate('cardStickers.t51') },
      { code: '1f4aa', name: translate('cardStickers.t52') },
    ],
  },
  {
    key: 'talk',
    label: translate('cardStickers.t53'),
    stickers: [
      { code: '1f4ac', name: translate('cardStickers.t54') },
      { code: '1f4af', name: translate('cardStickers.t55') },
      { code: '2757', name: translate('cardStickers.t56') },
      { code: '2753', name: translate('cardStickers.t57') },
      { code: '1f4e2', name: translate('cardStickers.t58') },
      { code: '1f3a4', name: translate('cardStickers.t59') },
      { code: '1f3b5', name: translate('cardStickers.t60') },
      { code: '1f3b6', name: translate('cardStickers.t61') },
    ],
  },
  {
    key: 'cute',
    label: translate('cardStickers.t62'),
    stickers: [
      { code: '1f431', name: translate('cardStickers.t63') },
      { code: '1f436', name: translate('cardStickers.t64') },
      { code: '1f430', name: translate('cardStickers.t65') },
      { code: '1f43b', name: translate('cardStickers.t66') },
      { code: '1f43c', name: translate('cardStickers.t67') },
      { code: '1f984', name: translate('cardStickers.t68') },
      { code: '1f338', name: translate('cardStickers.t69') },
      { code: '1f33c', name: translate('cardStickers.t70') },
      { code: '1f36d', name: translate('cardStickers.t71') },
      { code: '1f382', name: translate('cardStickers.t72') },
      { code: '2615', name: translate('cardStickers.t73') },
      { code: '1f34a', name: translate('cardStickers.t74') },
    ],
  },
]

/**
 * 스티커 그림 파일 주소를 만든다.
 *
 * @param code 스티커 코드
 * @returns public 아래의 SVG 경로
 */
export function cardStickerUrl(code: string): string {
  return `/stickers/${code}.svg`
}

/**
 * 코드로 스티커 이름을 찾는다.
 *
 * @param code 찾을 스티커 코드
 * @returns 스티커 이름이며 목록에 없으면 '스티커'
 */
export function cardStickerName(code: string): string {
  for (const category of CARD_STICKER_CATEGORIES()) {
    const found = category.stickers.find((sticker) => sticker.code === code)
    if (found) return found.name
  }
  return translate('cardStickers.t75')
}
