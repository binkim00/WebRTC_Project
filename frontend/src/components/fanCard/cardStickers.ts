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
      { code: '1f493', name: translate('cardStickers.t76') },
      { code: '1f49f', name: translate('cardStickers.t77') },
      { code: '2763', name: translate('cardStickers.t78') },
      { code: '1f494', name: translate('cardStickers.t79') },
      { code: '1f49d', name: translate('cardStickers.t177') },
      { code: '1f48c', name: translate('cardStickers.t178') },
      { code: '1f4e9', name: translate('cardStickers.t179') },
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
      { code: '1f4a5', name: translate('cardStickers.t80') },
      { code: '26a1', name: translate('cardStickers.t81') },
      { code: '1f3af', name: translate('cardStickers.t82') },
      { code: '1f52d', name: translate('cardStickers.t83') },
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
      { code: '1f643', name: translate('cardStickers.t84') },
      { code: '1f60b', name: translate('cardStickers.t85') },
      { code: '1f61c', name: translate('cardStickers.t86') },
      { code: '1f634', name: translate('cardStickers.t87') },
      { code: '1f62d', name: translate('cardStickers.t88') },
      { code: '1f632', name: translate('cardStickers.t89') },
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
      { code: '1f450', name: translate('cardStickers.t90') },
      { code: '1f918', name: translate('cardStickers.t91') },
      { code: '1f44a', name: translate('cardStickers.t92') },
      { code: '1f596', name: translate('cardStickers.t93') },
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
      { code: '1f4ad', name: translate('cardStickers.t94') },
      { code: '2705', name: translate('cardStickers.t95') },
      { code: '1f195', name: translate('cardStickers.t96') },
      { code: '1f4dd', name: translate('cardStickers.t97') },
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
      { code: '1f43d', name: translate('cardStickers.t98') },
      { code: '1f435', name: translate('cardStickers.t99') },
      { code: '1f638', name: translate('cardStickers.t100') },
      { code: '1f63b', name: translate('cardStickers.t101') },
      { code: '1f9f8', name: translate('cardStickers.t102') },
      { code: '1f380', name: translate('cardStickers.t103') },
    ],
  },
  {
    key: 'party',
    label: translate('cardStickers.t104'),
    stickers: [
      { code: '1f386', name: translate('cardStickers.t105') },
      { code: '1f387', name: translate('cardStickers.t106') },
      { code: '1f37e', name: translate('cardStickers.t107') },
      { code: '1f942', name: translate('cardStickers.t108') },
      { code: '1f396', name: translate('cardStickers.t109') },
      { code: '1f947', name: translate('cardStickers.t110') },
      { code: '1f3ab', name: translate('cardStickers.t111') },
      { code: '1f38b', name: translate('cardStickers.t113') },
      { code: '1f38f', name: translate('cardStickers.t114') },
      { code: '1f48e', name: translate('cardStickers.t172') },
      { code: '1f452', name: translate('cardStickers.t173') },
      { code: '1f484', name: translate('cardStickers.t174') },
      { code: '1f48d', name: translate('cardStickers.t175') },
      { code: '1f383', name: translate('cardStickers.t176') },
    ],
  },
  {
    key: 'music',
    label: translate('cardStickers.t115'),
    stickers: [
      { code: '1f3a7', name: translate('cardStickers.t116') },
      { code: '1f3b8', name: translate('cardStickers.t117') },
      { code: '1f3b9', name: translate('cardStickers.t118') },
      { code: '1f941', name: translate('cardStickers.t119') },
      { code: '1f4e3', name: translate('cardStickers.t120') },
      { code: '1f483', name: translate('cardStickers.t121') },
      { code: '1f57a', name: translate('cardStickers.t122') },
      { code: '1f3ac', name: translate('cardStickers.t123') },
    ],
  },
  {
    key: 'sweet',
    label: translate('cardStickers.t124'),
    stickers: [
      { code: '1f370', name: translate('cardStickers.t125') },
      { code: '1f9c1', name: translate('cardStickers.t126') },
      { code: '1f369', name: translate('cardStickers.t127') },
      { code: '1f36a', name: translate('cardStickers.t128') },
      { code: '1f36b', name: translate('cardStickers.t129') },
      { code: '1f36c', name: translate('cardStickers.t130') },
      { code: '1f366', name: translate('cardStickers.t131') },
      { code: '1f9cb', name: translate('cardStickers.t132') },
      { code: '1f353', name: translate('cardStickers.t133') },
      { code: '1f95b', name: translate('cardStickers.t134') },
    ],
  },
  {
    key: 'animal',
    label: translate('cardStickers.t135'),
    stickers: [
      { code: '1f42f', name: translate('cardStickers.t136') },
      { code: '1f981', name: translate('cardStickers.t137') },
      { code: '1f43a', name: translate('cardStickers.t138') },
      { code: '1f98a', name: translate('cardStickers.t139') },
      { code: '1f428', name: translate('cardStickers.t140') },
      { code: '1f439', name: translate('cardStickers.t141') },
      { code: '1f427', name: translate('cardStickers.t142') },
      { code: '1f423', name: translate('cardStickers.t143') },
      { code: '1f41d', name: translate('cardStickers.t144') },
      { code: '1f98b', name: translate('cardStickers.t145') },
      { code: '1f42d', name: translate('cardStickers.t165') },
      { code: '1f437', name: translate('cardStickers.t166') },
      { code: '1f414', name: translate('cardStickers.t167') },
      { code: '1f426', name: translate('cardStickers.t168') },
      { code: '1f419', name: translate('cardStickers.t169') },
      { code: '1f41f', name: translate('cardStickers.t170') },
      { code: '1f422', name: translate('cardStickers.t171') },
    ],
  },
  {
    key: 'nature',
    label: translate('cardStickers.t146'),
    stickers: [
      { code: '1f337', name: translate('cardStickers.t147') },
      { code: '1f339', name: translate('cardStickers.t148') },
      { code: '1f33b', name: translate('cardStickers.t149') },
      { code: '1f490', name: translate('cardStickers.t150') },
      { code: '1f340', name: translate('cardStickers.t151') },
      { code: '1f308', name: translate('cardStickers.t152') },
      { code: '2600', name: translate('cardStickers.t153') },
      { code: '1f319', name: translate('cardStickers.t154') },
      { code: '2601', name: translate('cardStickers.t155') },
      { code: '2744', name: translate('cardStickers.t156') },
      { code: '1f31e', name: translate('cardStickers.t157') },
      { code: '1f31b', name: translate('cardStickers.t158') },
      { code: '1f320', name: translate('cardStickers.t159') },
      { code: '1f342', name: translate('cardStickers.t160') },
      { code: '1f331', name: translate('cardStickers.t161') },
      { code: '1f33f', name: translate('cardStickers.t162') },
      { code: '1f30a', name: translate('cardStickers.t163') },
      { code: '1f344', name: translate('cardStickers.t164') },
    ],
  },
  {
    key: 'food',
    label: translate('cardStickers.t180'),
    stickers: [
      { code: '1f355', name: translate('cardStickers.t181') },
      { code: '1f354', name: translate('cardStickers.t182') },
      { code: '1f35f', name: translate('cardStickers.t183') },
      { code: '1f363', name: translate('cardStickers.t184') },
      { code: '1f371', name: translate('cardStickers.t185') },
      { code: '1f359', name: translate('cardStickers.t186') },
      { code: '1f368', name: translate('cardStickers.t187') },
      { code: '1f367', name: translate('cardStickers.t188') },
      { code: '1f36e', name: translate('cardStickers.t189') },
      { code: '1f95e', name: translate('cardStickers.t190') },
    ],
  },
  {
    key: 'play',
    label: translate('cardStickers.t191'),
    stickers: [
      { code: '1f3a1', name: translate('cardStickers.t192') },
      { code: '1f3a2', name: translate('cardStickers.t193') },
      { code: '1f3a0', name: translate('cardStickers.t194') },
      { code: '1f3ae', name: translate('cardStickers.t195') },
      { code: '1f3b2', name: translate('cardStickers.t196') },
      { code: '1f3b0', name: translate('cardStickers.t197') },
      { code: '1f3ad', name: translate('cardStickers.t198') },
      { code: '1f680', name: translate('cardStickers.t199') },
      { code: '1f9e9', name: translate('cardStickers.t200') },
    ],
  },
  {
    key: 'record',
    label: translate('cardStickers.t201'),
    stickers: [
      { code: '1f4f8', name: translate('cardStickers.t202') },
      { code: '1f4fd', name: translate('cardStickers.t203') },
      { code: '1f39e', name: translate('cardStickers.t204') },
      { code: '1f4fa', name: translate('cardStickers.t205') },
      { code: '1f4f1', name: translate('cardStickers.t206') },
      { code: '1f4da', name: translate('cardStickers.t207') },
      { code: '270f', name: translate('cardStickers.t208') },
      { code: '1f4ce', name: translate('cardStickers.t209') },
      { code: '1f4c5', name: translate('cardStickers.t210') },
      { code: '1f516', name: translate('cardStickers.t211') },
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
