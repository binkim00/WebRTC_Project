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

export const CARD_STICKER_CATEGORIES: readonly CardStickerCategory[] = [
  {
    key: 'heart',
    label: '하트',
    stickers: [
      { code: '2764', name: '하트' },
      { code: '1f496', name: '반짝이는 하트' },
      { code: '1f497', name: '커지는 하트' },
      { code: '1f49e', name: '도는 하트' },
      { code: '1f498', name: '화살 하트' },
      { code: '1f9e1', name: '주황 하트' },
      { code: '1f49b', name: '노란 하트' },
      { code: '1f49a', name: '초록 하트' },
      { code: '1f499', name: '파란 하트' },
      { code: '1f49c', name: '보라 하트' },
      { code: '1f90d', name: '흰 하트' },
      { code: '1f5a4', name: '검은 하트' },
    ],
  },
  {
    key: 'sparkle',
    label: '반짝·축하',
    stickers: [
      { code: '2728', name: '반짝임' },
      { code: '1f4ab', name: '별똥별' },
      { code: '1f31f', name: '빛나는 별' },
      { code: '2b50', name: '별' },
      { code: '1f389', name: '크래커' },
      { code: '1f38a', name: '색종이' },
      { code: '1f388', name: '풍선' },
      { code: '1f381', name: '선물' },
      { code: '1f451', name: '왕관' },
      { code: '1f3c6', name: '트로피' },
      { code: '1f3f5', name: '장식 리본' },
      { code: '1f52e', name: '수정구' },
    ],
  },
  {
    key: 'face',
    label: '표정',
    stickers: [
      { code: '1f60d', name: '하트 눈' },
      { code: '1f970', name: '사랑스러운 얼굴' },
      { code: '1f929', name: '별 눈' },
      { code: '1f973', name: '파티 얼굴' },
      { code: '1f618', name: '뽀뽀' },
      { code: '1f60a', name: '미소' },
      { code: '1f602', name: '웃음 눈물' },
      { code: '1f605', name: '땀 흘리는 웃음' },
      { code: '1f92d', name: '입 가린 얼굴' },
      { code: '1f917', name: '안아 주는 얼굴' },
      { code: '1f97a', name: '애원하는 얼굴' },
      { code: '1f622', name: '우는 얼굴' },
      { code: '1f631', name: '놀란 얼굴' },
      { code: '1f60e', name: '선글라스' },
    ],
  },
  {
    key: 'hand',
    label: '손동작',
    stickers: [
      { code: '1f44d', name: '엄지 척' },
      { code: '1f44f', name: '박수' },
      { code: '1f64c', name: '만세' },
      { code: '270c', name: '브이' },
      { code: '1f91f', name: '사랑해 손' },
      { code: '1f90c', name: '작은 하트 손' },
      { code: '1f44b', name: '손 흔들기' },
      { code: '1f64f', name: '두 손 모으기' },
      { code: '1f91d', name: '악수' },
      { code: '1f4aa', name: '힘내기' },
    ],
  },
  {
    key: 'talk',
    label: '말·소리',
    stickers: [
      { code: '1f4ac', name: '말풍선' },
      { code: '1f4af', name: '백 점' },
      { code: '2757', name: '느낌표' },
      { code: '2753', name: '물음표' },
      { code: '1f4e2', name: '확성기' },
      { code: '1f3a4', name: '마이크' },
      { code: '1f3b5', name: '음표' },
      { code: '1f3b6', name: '음표 여러 개' },
    ],
  },
  {
    key: 'cute',
    label: '동물·간식',
    stickers: [
      { code: '1f431', name: '고양이' },
      { code: '1f436', name: '강아지' },
      { code: '1f430', name: '토끼' },
      { code: '1f43b', name: '곰' },
      { code: '1f43c', name: '판다' },
      { code: '1f984', name: '유니콘' },
      { code: '1f338', name: '벚꽃' },
      { code: '1f33c', name: '꽃' },
      { code: '1f36d', name: '사탕' },
      { code: '1f382', name: '케이크' },
      { code: '2615', name: '커피' },
      { code: '1f34a', name: '귤' },
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
  for (const category of CARD_STICKER_CATEGORIES) {
    const found = category.stickers.find((sticker) => sticker.code === code)
    if (found) return found.name
  }
  return '스티커'
}
