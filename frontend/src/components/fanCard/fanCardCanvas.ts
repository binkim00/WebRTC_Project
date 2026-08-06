/**
 * 통화 기념 카드를 Canvas에 그린다.
 *
 * 외부 이미지를 쓰지 않고 그라데이션과 텍스트만 그린다. 배경에 다른 도메인의 이미지를 넣으면
 * canvas가 오염되어 `toBlob()`이 보안 오류로 막히는데, 카드는 저장·다운로드가 핵심이라
 * 처음부터 자체 도안만 사용한다.
 */

import { cardStickerUrl } from './cardStickers'
import { translate } from '../../i18n'

/** 카드 이미지 크기이며 세로형 포토카드 비율(4:5)이다. */
export const CARD_WIDTH = 1080
export const CARD_HEIGHT = 1350

/** 카드 한 장의 픽셀 크기다. 레이아웃마다 다를 수 있다. */
export type FanCardSize = { width: number; height: number }

/**
 * 네컷 세로 스트립의 크기다.
 *
 * <p>즉석사진 스트립처럼 사진과 글자만 남기고 좌우 여백을 두지 않아, 기본 카드보다
 * 좁고 길다.
 */
const FOURCUT_VERTICAL_SIZE: FanCardSize = { width: 600, height: 1620 }

/** 네컷 가로 스트립의 크기다. 칸을 한 줄로 늘어놓아 기본 카드보다 넓고 낮다. */
const FOURCUT_HORIZONTAL_SIZE: FanCardSize = { width: 1056, height: 782 }

/** 필름 한 롤처럼 길게 뽑는 카드 크기다. 세로 스트립보다 좌우 구멍 자리가 더 필요하다. */
const FILM_SIZE: FanCardSize = { width: 640, height: 1680 }

/**
 * 레이아웃에 맞는 카드 크기를 알려 준다.
 *
 * @param layout 그릴 레이아웃이며 undefined면 문구 전용이다
 * @returns 캔버스에 설정할 크기
 */
export function fanCardSizeOf(layout: FanCardLayout | undefined): FanCardSize {
  if (layout === 'FOURCUT_VERTICAL') return FOURCUT_VERTICAL_SIZE
  if (layout === 'FOURCUT_HORIZONTAL') return FOURCUT_HORIZONTAL_SIZE
  if (layout === 'FILM') return FILM_SIZE
  return { width: CARD_WIDTH, height: CARD_HEIGHT }
}

/** 카드 좌우 여백이다. */
const CARD_PADDING = 96

/** 문구에 사용할 폰트 크기 후보이며 큰 값부터 시도해 카드에 들어가는 첫 크기를 쓴다. */
const QUOTE_FONT_SIZES = [76, 68, 60, 52, 46, 40, 34]

/** 문구 영역에 허용하는 최대 높이다. 제목과 하단 정보 자리를 남겨 둔다. */
const QUOTE_AREA_HEIGHT = 680

/** 문구 줄 간격 배수다. */
const QUOTE_LINE_HEIGHT_RATIO = 1.45

/**
 * 팬이 고를 수 있는 카드 도안이다.
 *
 * <p>칸 배치(레이아웃)와 따로 두는 이유는 두 축이 서로 곱해지기 때문이다. 같은 여섯컷을 밤하늘로도,
 * 크림색으로도 뽑을 수 있어야 고르는 재미가 생긴다.
 */
export type FanCardThemeKey =
  | 'NIGHT'
  | 'LAVENDER'
  | 'SKY'
  | 'CREAM'
  | 'PEACH'
  | 'MINT'
  | 'SUNSET'
  | 'MONO'

/** 도안 하나가 정하는 색이다. */
export type FanCardTheme = {
  /** 카드 배경 그라데이션의 세 단계 색 */
  background: readonly [string, string, string]
  /**
   * 배경 위에 얹는 글자와 선의 기본 색(RGB)이다.
   *
   * <p>밝은 도안에서는 흰 글자가 보이지 않으므로 어두운 잉크를 쓴다. 투명도는 자리마다 다르게
   * 쓰던 값을 그대로 두고 색만 이 값으로 바꾼다.
   */
  ink: readonly [number, number, number]
  /** 사진 칸을 감싸는 테두리와 빈 칸 안내에 쓰는 색 */
  slot: string
  /** 문구 따옴표처럼 눈에 띄어야 하는 자리의 색 */
  accent: string
  /** 배경 위에 얹는 장식이며 NONE 이면 얹지 않는다 */
  ornament: CardOrnament
}

/** 도안별 색 묶음이다. NIGHT 는 지금까지 쓰던 색이라 기본값으로 둔다. */
export const FAN_CARD_THEMES: Record<FanCardThemeKey, FanCardTheme> = {
  NIGHT: {
    background: ['#1b1030', '#3b1d63', '#6d2d6b'],
    ink: [255, 255, 255],
    slot: 'rgba(255, 255, 255, 0.18)',
    accent: 'rgba(255, 255, 255, 0.26)',
    ornament: 'STARS',
  },
  LAVENDER: {
    background: ['#efe6ff', '#e3d6fb', '#d8c9f5'],
    ink: [58, 38, 92],
    slot: 'rgba(88, 60, 140, 0.22)',
    accent: 'rgba(120, 86, 180, 0.3)',
    ornament: 'PETALS',
  },
  SKY: {
    background: ['#e4f2ff', '#cfe7fb', '#bcdcf6'],
    ink: [24, 58, 92],
    slot: 'rgba(30, 80, 130, 0.22)',
    accent: 'rgba(50, 110, 170, 0.3)',
    ornament: 'CLOUDS',
  },
  CREAM: {
    background: ['#fdf6e6', '#f7ead0', '#f0dcbb'],
    ink: [82, 58, 30],
    slot: 'rgba(120, 88, 48, 0.22)',
    accent: 'rgba(150, 110, 60, 0.3)',
    ornament: 'SPARKS',
  },
  PEACH: {
    background: ['#ffeeee', '#ffdede', '#ffcdd2'],
    ink: [122, 40, 58],
    slot: 'rgba(170, 70, 90, 0.22)',
    accent: 'rgba(200, 90, 110, 0.3)',
    ornament: 'PETALS',
  },
  MINT: {
    background: ['#e6f8f1', '#d3f0e5', '#c0e8d9'],
    ink: [22, 78, 62],
    slot: 'rgba(30, 110, 90, 0.22)',
    accent: 'rgba(50, 140, 115, 0.3)',
    ornament: 'BUBBLES',
  },
  SUNSET: {
    background: ['#ff9a6b', '#f2678f', '#a94bb4'],
    ink: [255, 255, 255],
    slot: 'rgba(255, 255, 255, 0.22)',
    accent: 'rgba(255, 255, 255, 0.3)',
    ornament: 'CONFETTI',
  },
  MONO: {
    background: ['#1a1a1c', '#2a2a2e', '#3a3a40'],
    ink: [246, 246, 248],
    slot: 'rgba(255, 255, 255, 0.16)',
    accent: 'rgba(255, 255, 255, 0.24)',
    ornament: 'SPARKS',
  },
}

/** 손대지 않은 카드의 도안이다. */
export const DEFAULT_FAN_CARD_THEME: FanCardThemeKey = 'NIGHT'

/**
 * 도안의 잉크 색을 원하는 투명도로 만든다.
 *
 * @param theme 적용할 도안
 * @param alpha 0~1 투명도
 * @returns canvas 에 넣을 rgba 문자열
 */
function themeInk(theme: FanCardTheme, alpha: number): string {
  const [r, g, b] = theme.ink
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * 카드에 적용할 도안을 고른다. 값이 없거나 아는 도안이 아니면 기본 도안을 쓴다.
 *
 * @param key 팬이 고른 도안 키
 * @returns 색 묶음
 */
function themeOf(key: FanCardThemeKey | undefined): FanCardTheme {
  return FAN_CARD_THEMES[key ?? DEFAULT_FAN_CARD_THEME] ?? FAN_CARD_THEMES.NIGHT
}


/**
 * 도안이 배경 위에 얹는 장식 종류다.
 *
 * <p>배경색만 바꾸면 색만 다른 같은 카드로 보인다. 도안마다 성격이 다른 장식을 얹어 프레임처럼
 * 보이게 한다. 그림 파일이 아니라 도형으로 그리는 이유는 카드 크기가 레이아웃마다 달라 자산을
 * 배치하면 비율이 어긋나기 때문이다.
 */
type CardOrnament = 'STARS' | 'PETALS' | 'CLOUDS' | 'CONFETTI' | 'BUBBLES' | 'SPARKS' | 'NONE'

/**
 * 정해진 순서로 같은 값을 돌려주는 난수다.
 *
 * <p>장식 위치에 Math.random 을 쓰면 다시 그릴 때마다 자리가 바뀌어, 미리보기와 내려받은 카드가
 * 달라진다. 카드 크기를 씨앗으로 삼아 같은 카드에서는 언제나 같은 자리에 놓이게 한다.
 *
 * @param seed 씨앗값
 * @returns 0 이상 1 미만 값을 차례로 내주는 함수
 */
function seededRandom(seed: number): () => number {
  let value = seed % 2147483647
  if (value <= 0) value += 2147483646
  return () => {
    value = (value * 16807) % 2147483647
    return (value - 1) / 2147483646
  }
}

/** 별 하나를 그린다. 뾰족한 네 갈래로 그려 반짝임처럼 보이게 한다. */
function drawStarShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
): void {
  ctx.beginPath()
  for (let index = 0; index < 8; index += 1) {
    const angle = (Math.PI / 4) * index
    const length = index % 2 === 0 ? radius : radius * 0.34
    const px = x + Math.cos(angle) * length
    const py = y + Math.sin(angle) * length
    if (index === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fill()
}

/** 꽃잎 하나를 그린다. 두 곡선을 마주 붙여 잎 모양을 만든다. */
function drawPetalShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  rotation: number,
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rotation)
  ctx.beginPath()
  ctx.moveTo(0, -size)
  ctx.quadraticCurveTo(size * 0.72, 0, 0, size)
  ctx.quadraticCurveTo(-size * 0.72, 0, 0, -size)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** 구름 하나를 그린다. 크기가 다른 원 세 개를 겹쳐 뭉치게 만든다. */
function drawCloudShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  ctx.beginPath()
  ctx.arc(x - size * 0.55, y, size * 0.52, 0, Math.PI * 2)
  ctx.arc(x + size * 0.2, y - size * 0.22, size * 0.62, 0, Math.PI * 2)
  ctx.arc(x + size * 0.78, y + size * 0.05, size * 0.44, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * 도안 장식을 배경 위에 얹는다.
 *
 * <p>사진과 글자보다 아래에 깔리도록 배경을 그린 직후에 호출한다. 사진 칸 자리는 어차피 사진이
 * 덮으므로 피하지 않고, 대신 진하기를 낮춰 글자를 방해하지 않게 한다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param theme 적용할 도안
 * @param width 카드 너비
 * @param height 카드 높이
 */
function drawThemeOrnaments(
  ctx: CanvasRenderingContext2D,
  theme: FanCardTheme,
  width: number,
  height: number,
): void {
  if (theme.ornament === 'NONE') return

  const random = seededRandom(Math.round(width * 31 + height * 17))
  ctx.save()

  switch (theme.ornament) {
    case 'STARS': {
      // 밤하늘 — 작은 별을 위쪽에 촘촘히, 아래로 갈수록 드물게 흩뿌린다.
      for (let index = 0; index < 46; index += 1) {
        const x = random() * width
        const y = random() * height
        const bias = 1 - y / height
        if (random() > 0.35 + bias * 0.5) continue
        ctx.fillStyle = themeInk(theme, 0.1 + random() * 0.28)
        drawStarShape(ctx, x, y, 4 + random() * 9)
      }
      break
    }
    case 'PETALS': {
      // 라벤더·복숭아 — 꽃잎이 흩날리는 결을 만든다. 방향을 조금씩 틀어 겹쳐 놓는다.
      for (let index = 0; index < 26; index += 1) {
        const x = random() * width
        const y = random() * height
        ctx.fillStyle = theme.accent
        ctx.globalAlpha = 0.34 + random() * 0.3
        drawPetalShape(ctx, x, y, 12 + random() * 20, random() * Math.PI)
      }
      break
    }
    case 'CLOUDS': {
      // 하늘 — 큰 구름을 위아래 구석에 두고 가운데는 비워 사진이 답답하지 않게 한다.
      const spots = [
        { x: width * 0.16, y: height * 0.08, size: 62 },
        { x: width * 0.88, y: height * 0.14, size: 46 },
        { x: width * 0.12, y: height * 0.93, size: 52 },
        { x: width * 0.84, y: height * 0.88, size: 68 },
      ]
      for (const spot of spots) {
        ctx.fillStyle = themeInk(theme, 0.12)
        drawCloudShape(ctx, spot.x, spot.y, spot.size)
      }
      break
    }
    case 'CONFETTI': {
      // 노을 — 색종이 조각이 떨어지는 결. 네모를 비스듬히 눕혀 흩뿌린다.
      for (let index = 0; index < 40; index += 1) {
        const x = random() * width
        const y = random() * height
        const size = 8 + random() * 16
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(random() * Math.PI)
        ctx.fillStyle = themeInk(theme, 0.16 + random() * 0.22)
        ctx.fillRect(-size / 2, -size / 4, size, size / 2)
        ctx.restore()
      }
      break
    }
    case 'BUBBLES': {
      // 민트 — 크기가 다른 동그라미를 테두리 없이 얹어 청량한 결을 만든다.
      for (let index = 0; index < 30; index += 1) {
        const x = random() * width
        const y = random() * height
        const radius = 10 + random() * 34
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.strokeStyle = themeInk(theme, 0.12 + random() * 0.14)
        ctx.lineWidth = 2 + random() * 3
        ctx.stroke()
      }
      break
    }
    case 'SPARKS': {
      // 크림·흑백 — 가느다란 십자 반짝임을 드물게 둔다. 종이 결 같은 담백한 장식이다.
      for (let index = 0; index < 22; index += 1) {
        const x = random() * width
        const y = random() * height
        const length = 8 + random() * 18
        ctx.strokeStyle = themeInk(theme, 0.14 + random() * 0.16)
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(x - length, y)
        ctx.lineTo(x + length, y)
        ctx.moveTo(x, y - length)
        ctx.lineTo(x, y + length)
        ctx.stroke()
      }
      break
    }
    default:
      break
  }

  ctx.restore()
}

/**
 * 팬이 고를 수 있는 카드 레이아웃이다.
 *
 * <p>INSTA·POLAROID는 사진 한 장, FOURCUT 계열은 네 장을 쓴다. 네컷은 칸 배치가 다른
 * 세 가지(2×2 격자, 세로 스트립, 가로 스트립)를 따로 고를 수 있다.
 */
export type FanCardLayout =
  | 'INSTA'
  | 'POLAROID'
  | 'TWOCUT'
  | 'FOURCUT'
  | 'FOURCUT_VERTICAL'
  | 'FOURCUT_HORIZONTAL'
  | 'FILM'
  | 'SIXCUT'
  | 'HEART'
  | 'CIRCLE'
  | 'SCATTER'

/** FOURCUT이 채우는 칸 수다. */
const FOUR_CUT_SLOTS = 4

/** TWOCUT이 채우는 칸 수다. */
const TWO_CUT_SLOTS = 2

/** SIXCUT이 채우는 칸 수다. */
const SIX_CUT_SLOTS = 6

/** CIRCLE이 채우는 칸 수다. */
const CIRCLE_SLOTS = 3

/** SCATTER가 채우는 칸 수다. */
const SCATTER_SLOTS = 3

/**
 * 팬이 고를 수 있는 카드 글꼴이다.
 *
 * <p>DEFAULT는 서비스 본문과 같은 글꼴이고 나머지는 index.css의 @font-face로 등록해 둔
 * 것이다. 값을 늘리려면 @font-face 선언과 아래 매핑을 함께 넓혀야 한다.
 */
export type FanCardFont =
  | 'DEFAULT'
  | 'ROUND'
  | 'HANDWRITING'
  | 'HEADLINE'
  | 'IMPACT'
  | 'SOFT'
  | 'CUTE'

/** 글꼴 키를 Canvas font 속성에 넣을 패밀리 이름으로 옮긴다. DEFAULT는 페이지 글꼴을 쓴다. */
const FONT_FAMILY_BY_KEY: Record<FanCardFont, string | undefined> = {
  DEFAULT: undefined,
  ROUND: '"Jua"',
  HANDWRITING: '"Gaegu"',
  HEADLINE: '"Do Hyeon"',
  IMPACT: '"Black Han Sans"',
  SOFT: '"Dongle"',
  CUTE: '"Hi Melody"',
}

/**
 * 사진 한 장을 칸 안에서 어떻게 놓을지다.
 *
 * <p>칸 비율과 사진 비율이 다르면 기본 배치(cover)는 가운데만 남기고 잘라 낸다. 통화 화면은
 * 가로로 긴데 정사각·세로 칸도 있어서, 팬이 직접 보여 줄 부분을 정할 수 있어야 한다.
 *
 * <p>이동량을 칸 크기에 대한 비율로 두는 이유는 레이아웃마다 칸 크기가 다르기 때문이다.
 * 픽셀로 저장하면 레이아웃을 바꾸는 순간 사진이 엉뚱한 곳으로 밀린다.
 */
export type PhotoAdjustment = {
  /** 칸 너비에 대한 가로 이동 비율이며 0이면 가운데다. */
  offsetX: number
  /** 칸 높이에 대한 세로 이동 비율이며 0이면 가운데다. */
  offsetY: number
  /** 칸을 꽉 채우는 배율을 1로 본 확대율이다. 1보다 작으면 칸 안에 여백이 생긴다. */
  scale: number
}

/** 손대지 않은 사진의 기본 배치다. 지금까지와 같은 결과를 낸다. */
export const DEFAULT_PHOTO_ADJUSTMENT: PhotoAdjustment = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
}

/**
 * 카드에서 사진 한 장이 차지하는 자리다.
 *
 * <p>어느 칸을 눌렀는지 판단하려면 화면 쪽에서도 칸 위치를 알아야 하는데, 그 계산은 레이아웃
 * 그리기 함수 안에 있다. 같은 계산을 두 곳에 두면 반드시 어긋나므로 그린 쪽이 알려 준다.
 */
export type PhotoSlotRect = {
  /** 사진 목록에서의 순번 */
  index: number
  /** 칸 왼쪽 좌표 */
  x: number
  /** 칸 위쪽 좌표 */
  y: number
  /** 칸 너비 */
  width: number
  /** 칸 높이 */
  height: number
}

/**
 * 사진을 칸 안에서 얼마나 밀 수 있는지 구한다.
 *
 * <p>기본 배치는 원본 전체를 담으므로(contain) 손대지 않으면 밀 여지가 없다. 팬이 키운 만큼만
 * 칸을 넘어가고, 넘어간 폭의 절반까지만 밀 수 있다. 더 밀면 칸 한쪽에 빈 자리가 생겨 흐린 배경이
 * 드러난다.
 *
 * <p>칸을 그리는 쪽과 끌기를 처리하는 쪽이 같은 값을 써야 미리보기와 저장본이 어긋나지 않아
 * 한곳에 둔다.
 *
 * @param slotWidth 칸 너비
 * @param slotHeight 칸 높이
 * @param photoWidth 사진 너비
 * @param photoHeight 사진 높이
 * @param zoom 확대율이며 1이면 원본 전체가 담긴다
 * @returns 칸 크기에 대한 비율로 나타낸 가로·세로 이동 한계
 */
export function photoOffsetLimits(
  slotWidth: number,
  slotHeight: number,
  photoWidth: number,
  photoHeight: number,
  zoom: number,
): { x: number; y: number } {
  if (slotWidth <= 0 || slotHeight <= 0 || photoWidth <= 0 || photoHeight <= 0) {
    return { x: 0, y: 0 }
  }

  const contain = Math.min(slotWidth / photoWidth, slotHeight / photoHeight)
  const drawWidth = photoWidth * contain * zoom
  const drawHeight = photoHeight * contain * zoom
  return {
    x: Math.max(0, (drawWidth - slotWidth) / 2 / slotWidth),
    y: Math.max(0, (drawHeight - slotHeight) / 2 / slotHeight),
  }
}

/** 카드에 담을 정보다. */
export type FanCardArtwork = {
  /** 팬이 고른 문구다. 문구 고르기는 선택 사항이라 없을 수 있다. */
  text?: string
  /** 팬미팅 제목 */
  meetingTitle: string
  /** 인플루언서 표시 이름 */
  influencerName: string
  /** 팬 닉네임 */
  fanNickname: string
  /** 카드에 표시할 날짜 문구 */
  dateLabel: string
  /** 팬이 고른 레이아웃이다. 없으면 사진 없는 문구 전용 카드를 그린다. */
  layout?: FanCardLayout
  /** 합성할 사진이다. INSTA·POLAROID는 첫 장만, FOURCUT은 앞 네 장을 쓴다. */
  photos?: readonly ImageBitmap[]
  /** 사진별 배치이며 photos와 같은 순번으로 맞춘다. 없으면 기본 배치로 그린다. */
  photoAdjustments?: readonly PhotoAdjustment[]
  /** 팬이 고른 글꼴이다. 없거나 내려받지 못하면 서비스 기본 글꼴로 그린다. */
  fontKey?: FanCardFont
  /** 팬이 고른 카드 도안이며 없으면 기본 도안(밤하늘)으로 그린다. */
  themeKey?: FanCardThemeKey
  /**
   * 문구 크기 배율이며 없으면 1이다.
   *
   * <p>글꼴마다 같은 px 에서 글자가 커 보이는 정도가 달라, 글꼴을 바꾸면 문구가 갑자기 작아
   * 보이거나 답답해진다. 자동 맞춤 결과를 이 값으로 키우거나 줄일 수 있게 열어 둔다.
   */
  quoteScale?: number
  /** 팬이 카드 위에 올린 스티커와 글자다. 목록 순서대로 위에 쌓인다. */
  decorations?: readonly CardDecoration[]
}

/**
 * 팬이 카드 위에 얹은 꾸미기 요소 하나다.
 *
 * <p>좌표와 크기는 모두 카드 픽셀 기준이라 레이아웃마다 카드 크기가 달라도 그대로 쓸 수
 * 있다. 화면에서 캔버스를 줄여 보여 주더라도 저장본과 위치가 어긋나지 않는다.
 */
export type CardDecoration = {
  /** 목록에서 구분하는 식별자 */
  id: string
  /** STICKER는 그림, TEXT는 팬이 쓴 글자다. */
  kind: 'STICKER' | 'TEXT'
  /** STICKER면 스티커 코드, TEXT면 표시할 글자 */
  content: string
  /** 카드 안에서의 가로 중심 */
  x: number
  /** 카드 안에서의 세로 중심 */
  y: number
  /** 스티커는 한 변의 길이, 글자는 글꼴 크기다. */
  size: number
  /** 라디안 단위 회전각 */
  rotation: number
}

/**
 * 문구를 카드 폭에 맞게 여러 줄로 나눈다.
 *
 * 한국어는 공백 없이 이어지는 구간이 많아 단어 단위로 끊으면 한 줄이 폭을 넘긴다.
 * 그래서 글자 단위로 폭을 재며 채우고, 줄바꿈 문자는 그대로 살린다.
 *
 * @param ctx 폭 계산에 사용할 컨텍스트이며 호출 전에 font가 설정되어 있어야 한다
 * @param text 나눌 문구
 * @param maxWidth 한 줄의 최대 폭
 * @returns 줄 단위로 나눈 문구
 */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = []
  let line = ''

  for (const char of text) {
    if (char === '\n') {
      lines.push(line)
      line = ''
      continue
    }

    const candidate = line + char
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line)
      line = char
    } else {
      line = candidate
    }
  }

  if (line) lines.push(line)
  return lines
}

/**
 * 문구가 카드 영역에 들어가는 가장 큰 폰트 크기와 줄 나눔을 함께 고른다.
 *
 * @param ctx 폭 계산에 사용할 컨텍스트
 * @param text 카드에 넣을 문구
 * @param fontFamily 사용할 폰트 패밀리
 * @param maxWidth 한 줄의 최대 폭
 * @param areaHeight 문구가 차지할 수 있는 최대 높이이며 레이아웃마다 다르다
 * @param fontSizes 큰 값부터 시도할 폰트 크기 후보
 * @returns 선택한 폰트 크기와 줄 목록
 */
function fitQuote(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontFamily: string,
  maxWidth: number,
  areaHeight: number = QUOTE_AREA_HEIGHT,
  fontSizes: readonly number[] = QUOTE_FONT_SIZES,
  scale: number = 1,
): { fontSize: number; lines: string[] } {
  // 글꼴마다 같은 px 에서 글자가 커 보이는 정도가 달라, 팬이 고른 배율을 후보 크기에 곱한다.
  // 배율이 1이면 후보가 그대로여서 지금까지와 같은 크기가 나온다.
  const candidates = scale === 1 ? fontSizes : fontSizes.map((size) => size * scale)
  let fallback = { fontSize: candidates.at(-1) ?? 34, lines: [text] }

  for (const fontSize of candidates) {
    ctx.font = `700 ${fontSize}px ${fontFamily}`
    const lines = wrapText(ctx, text, maxWidth)
    const height = lines.length * fontSize * QUOTE_LINE_HEIGHT_RATIO
    if (height <= areaHeight) {
      return { fontSize, lines }
    }
    fallback = { fontSize, lines }
  }

  // 어떤 크기로도 다 담기지 않으면 가장 작은 크기로 그린다. 문구 길이는 서버가 제한한다.
  return fallback
}

/**
 * 카드에 실제로 그릴 문구를 정리해 돌려준다.
 *
 * <p>문구 고르기는 선택 사항이라 없을 수 있다. 공백만 있는 값도 빈 문구로 보아, 따옴표만
 * 덩그러니 남거나 빈 줄이 자리를 차지하는 일을 막는다.
 *
 * @param artwork 카드에 담을 정보
 * @returns 그릴 문구이며 고르지 않았으면 빈 문자열
 */
function cardQuoteText(artwork: FanCardArtwork): string {
  return artwork.text?.trim() ?? ''
}

/**
 * 페이지가 실제로 쓰는 폰트를 읽어 카드에도 같은 글꼴을 적용한다.
 *
 * @returns Canvas font 속성에 넣을 폰트 패밀리
 */
function resolveFontFamily(): string {
  if (typeof globalThis.getComputedStyle !== 'function') {
    return 'sans-serif'
  }
  const pageFont = globalThis.getComputedStyle(document.body).fontFamily
  return pageFont?.trim() ? pageFont : 'sans-serif'
}

/**
 * 팬이 고른 글꼴을 실제로 쓸 수 있는 상태로 만들고 Canvas용 패밀리 문자열을 돌려준다.
 *
 * <p>@font-face 선언만으로는 파일을 내려받지 않으므로 쓰기 전에 명시적으로 로드한다.
 * 내려받지 못했으면 글자가 대체 글꼴로 그려져 미리보기와 저장본이 달라지므로,
 * 확인에 실패하면 처음부터 서비스 기본 글꼴로 그린다.
 *
 * @param fontKey 팬이 고른 글꼴 키
 * @returns Canvas font 속성에 넣을 패밀리 문자열
 */
async function resolveCardFontFamily(fontKey: FanCardFont | undefined): Promise<string> {
  const fallback = resolveFontFamily()
  const family = fontKey ? FONT_FAMILY_BY_KEY[fontKey] : undefined
  if (!family || !document.fonts) return fallback

  try {
    await Promise.all([
      document.fonts.load(`400 40px ${family}`),
      document.fonts.load(`700 40px ${family}`),
    ])
  } catch {
    return fallback
  }

  return document.fonts.check(`700 40px ${family}`) ? `${family}, ${fallback}` : fallback
}

/**
 * 인플루언서 싸인에 쓸 손글씨 글꼴을 준비한다.
 *
 * <p>팬이 고른 카드 글꼴과 무관하게 싸인은 항상 손글씨 계열로 그린다. 내려받지 못하면
 * 브라우저 필기체 계열로 대신 그린다.
 *
 * @returns Canvas font 속성에 넣을 패밀리 문자열
 */
async function resolveSignatureFontFamily(): Promise<string> {
  const fallback = '"Segoe Script", "Brush Script MT", cursive'
  const family = '"Gaegu"'
  if (!document.fonts) return fallback

  try {
    await document.fonts.load(`700 40px ${family}`)
  } catch {
    return fallback
  }

  return document.fonts.check(`700 40px ${family}`) ? `${family}, ${fallback}` : fallback
}

/**
 * 인플루언서 이름을 사인처럼 그린다.
 *
 * <p>손글씨 글꼴에 살짝 기울기를 주고 밑줄 획을 더해 실제 싸인 느낌을 낸다. 사진 위에
 * 올라가도 읽히도록 어두운 그림자를 함께 그린다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param name 인플루언서 표시 이름
 * @param signatureFont 손글씨 글꼴 패밀리
 * @param centerX 싸인의 가로 중심
 * @param baselineY 싸인 글자의 기준선 y좌표
 * @param size 글자 크기
 */
function drawSignature(
  ctx: CanvasRenderingContext2D,
  name: string,
  signatureFont: string,
  centerX: number,
  baselineY: number,
  size: number,
): void {
  if (!name.trim()) return

  ctx.save()
  ctx.translate(centerX, baselineY)
  ctx.rotate(-0.08)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)'
  ctx.shadowBlur = 10
  ctx.shadowOffsetY = 2
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 ${size}px ${signatureFont}`
  ctx.fillText(name, 0, 0)

  // 이름 아래로 흐르는 밑줄 획이 사인 인상을 만든다.
  const width = ctx.measureText(name).width
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = Math.max(2, size * 0.055)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-width * 0.56, size * 0.26)
  ctx.quadraticCurveTo(0, size * 0.52, width * 0.6, size * 0.16)
  ctx.stroke()
  ctx.restore()
}

/**
 * 레이아웃별로 정한 자리에 인플루언서 싸인을 얹는다.
 *
 * <p>사진 레이아웃은 사진 위 오른쪽 아래에, 문구 전용 카드는 하단 정보 위에 그린다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param artwork 카드에 담을 정보
 * @param layout 실제로 그린 레이아웃이며 undefined면 문구 전용이다
 * @param signatureFont 손글씨 글꼴 패밀리
 */
function drawSignatureForLayout(
  ctx: CanvasRenderingContext2D,
  artwork: FanCardArtwork,
  layout: FanCardLayout | undefined,
  signatureFont: string,
): void {
  const name = artwork.influencerName

  switch (layout) {
    case 'INSTA':
      // 사진 영역(40 + 90 + 76 ~ +860)의 오른쪽 아래 구석이다.
      drawSignature(ctx, name, signatureFont, CARD_WIDTH - 250, 1000, 56)
      return
    case 'POLAROID':
      // 정사각 사진(90+45 ~ +810)의 오른쪽 아래 구석이다.
      drawSignature(ctx, name, signatureFont, CARD_WIDTH - 280, 880, 56)
      return
    case 'FOURCUT':
      // 2×2 격자 아래 오른쪽이다. 가운데 문구와 겹치지 않게 구석에 둔다.
      drawSignature(ctx, name, signatureFont, CARD_WIDTH - 250, 1120, 52)
      return
    case 'FOURCUT_VERTICAL': {
      const { width } = FOURCUT_VERTICAL_SIZE
      const slotHeight = Math.round(((width - 48) * 9) / 16)
      const stripBottom = 200 + FOUR_CUT_SLOTS * slotHeight + (FOUR_CUT_SLOTS - 1) * 10
      // 마지막 칸 오른쪽 아래에 겹쳐 그린다.
      drawSignature(ctx, name, signatureFont, width - 160, stripBottom - 28, 42)
      return
    }
    case 'FOURCUT_HORIZONTAL': {
      const { width } = FOURCUT_HORIZONTAL_SIZE
      const slotWidth = (width - 48 - 12 * (FOUR_CUT_SLOTS - 1)) / FOUR_CUT_SLOTS
      const stripBottom = 196 + Math.round((slotWidth * 16) / 9)
      drawSignature(ctx, name, signatureFont, width - 170, stripBottom - 30, 42)
      return
    }
    case 'TWOCUT': {
      // 두 칸 중 아래 칸의 오른쪽 아래다. 칸이 커서 서명도 조금 크게 둔다.
      const slotHeight = Math.round(((CARD_WIDTH - 140) * 9) / 16)
      const stripBottom = 168 + slotHeight * TWO_CUT_SLOTS + 26
      drawSignature(ctx, name, signatureFont, CARD_WIDTH - 250, stripBottom - 30, 48)
      return
    }
    case 'FILM': {
      const { width } = FILM_SIZE
      const slotHeight = Math.round(((width - 132) * 9) / 16)
      const stripBottom = 112 + slotHeight * FOUR_CUT_SLOTS + 12 * (FOUR_CUT_SLOTS - 1)
      drawSignature(ctx, name, signatureFont, width - 150, stripBottom - 26, 40)
      return
    }
    case 'HEART':
      // 하트 아래 오른쪽이다. 곡선을 침범하지 않게 조금 안쪽에 둔다.
      drawSignature(ctx, name, signatureFont, CARD_WIDTH - 260, 940, 48)
      return
    case 'CIRCLE':
      // 마지막 동그라미 오른쪽 아래다.
      drawSignature(ctx, name, signatureFont, CARD_WIDTH - 220, 1090, 42)
      return
    case 'SCATTER':
      // 흩어 놓은 사진 사이 오른쪽 아래 빈 자리다.
      drawSignature(ctx, name, signatureFont, CARD_WIDTH - 230, 1170, 44)
      return
    case 'SIXCUT': {
      // 격자가 세 줄이라 아래 여백이 좁다. 마지막 줄 오른쪽 아래에 겹쳐 그린다.
      const slotWidth = (CARD_WIDTH - 66 * 2 - 18) / 2
      const slotHeight = Math.round((slotWidth * 9) / 16)
      const gridBottom = 132 + slotHeight * 3 + 18 * 2
      drawSignature(ctx, name, signatureFont, CARD_WIDTH - 230, gridBottom - 22, 44)
      return
    }
    default:
      // 문구 전용 카드 — 하단 정보 블록 위 오른쪽이다.
      drawSignature(ctx, name, signatureFont, CARD_WIDTH - 300, CARD_HEIGHT - 320, 60)
  }
}

/**
 * 기념 카드를 캔버스에 그린다.
 *
 * 웹폰트가 아직 로드되지 않았으면 글자가 대체 글꼴로 그려져 저장된 이미지가 화면과 달라지므로
 * 폰트 준비를 기다린 뒤 그린다.
 *
 * <p>사진을 넘기지 않았거나 레이아웃을 고르지 않았으면 문구 전용 카드를 그린다. 셔터를
 * 누르지 않았거나 촬영에 실패한 팬도 카드를 받을 수 있어야 하기 때문이다. 반대로 문구도
 * 선택 사항이라, 문구가 없으면 그 자리만 비우고 사진과 꾸미기로 카드를 완성한다.
 *
 * @param canvas 그릴 대상 캔버스
 * @param artwork 카드에 담을 정보
 * @throws Error 2D 컨텍스트를 얻지 못한 경우
 */
export async function drawFanCard(
  canvas: HTMLCanvasElement,
  artwork: FanCardArtwork,
): Promise<PhotoSlotRect[]> {
  const photos = artwork.photos ?? []
  // 사진이 없으면 문구 전용으로 그리므로 크기도 기본 카드에 맞춘다.
  const size = fanCardSizeOf(photos.length > 0 ? artwork.layout : undefined)
  canvas.width = size.width
  canvas.height = size.height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error(translate('fanCardCanvas.t1'))
  }

  await document.fonts?.ready
  const fontFamily = await resolveCardFontFamily(artwork.fontKey)

  let slots: PhotoSlotRect[] = []
  if (photos.length === 0) {
    drawQuoteOnlyCard(ctx, artwork, fontFamily)
  } else {
    switch (artwork.layout) {
      case 'INSTA':
        slots = drawInstaCard(ctx, artwork, photos, fontFamily)
        break
      case 'POLAROID':
        slots = drawPolaroidCard(ctx, artwork, photos, fontFamily)
        break
      case 'FOURCUT':
        slots = drawFourCutCard(ctx, artwork, photos, fontFamily)
        break
      case 'FOURCUT_VERTICAL':
        slots = drawFourCutVerticalCard(ctx, artwork, photos, fontFamily)
        break
      case 'FOURCUT_HORIZONTAL':
        slots = drawFourCutHorizontalCard(ctx, artwork, photos, fontFamily)
        break
      case 'TWOCUT':
        slots = drawTwoCutCard(ctx, artwork, photos, fontFamily)
        break
      case 'FILM':
        slots = drawFilmCard(ctx, artwork, photos, fontFamily)
        break
      case 'SIXCUT':
        slots = drawSixCutCard(ctx, artwork, photos, fontFamily)
        break
      case 'HEART':
        slots = drawHeartCard(ctx, artwork, photos, fontFamily)
        break
      case 'CIRCLE':
        slots = drawCircleCard(ctx, artwork, photos, fontFamily)
        break
      case 'SCATTER':
        slots = drawScatterCard(ctx, artwork, photos, fontFamily)
        break
      default:
        drawQuoteOnlyCard(ctx, artwork, fontFamily)
    }
  }

  // 인플루언서 싸인 — 도안 위, 꾸미기 요소 아래에 얹는다.
  const signatureFont = await resolveSignatureFontFamily()
  drawSignatureForLayout(
    ctx,
    artwork,
    photos.length > 0 ? artwork.layout : undefined,
    signatureFont,
  )

  // 꾸미기 요소는 카드를 다 그린 뒤 맨 위에 얹는다.
  if (artwork.decorations?.length) {
    await drawDecorations(ctx, artwork.decorations, fontFamily)
  }

  // 사진이 실제로 들어간 칸만 돌려준다. 빈 칸은 누를 대상이 아니다.
  return slots.filter((slot) => Boolean(photos[slot.index]))
}

/**
 * 사진 없이 문구만 담는 카드를 그린다. 레이아웃을 고르지 않았을 때의 기본 도안이다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param artwork 카드에 담을 정보
 * @param fontFamily 사용할 폰트 패밀리
 */
function drawQuoteOnlyCard(
  ctx: CanvasRenderingContext2D,
  artwork: FanCardArtwork,
  fontFamily: string,
): void {
  const theme = themeOf(artwork.themeKey)
  const contentWidth = CARD_WIDTH - CARD_PADDING * 2

  drawBackground(ctx, theme)

  // 팬미팅 제목
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = themeInk(theme, 0.72)
  ctx.font = `600 34px ${fontFamily}`
  ctx.fillText(truncate(ctx, artwork.meetingTitle, contentWidth), CARD_WIDTH / 2, 168)

  // 문구 — 카드의 주인공이라 남은 공간을 최대한 쓴다. 문구를 고르지 않았으면 비워 둔다.
  const quoteText = cardQuoteText(artwork)
  if (quoteText) {
    const quote = fitQuote(
      ctx, quoteText, fontFamily, contentWidth,
      QUOTE_AREA_HEIGHT, QUOTE_FONT_SIZES, artwork.quoteScale,
    )
    const lineHeight = quote.fontSize * QUOTE_LINE_HEIGHT_RATIO
    const quoteBlockHeight = quote.lines.length * lineHeight
    let quoteY = (CARD_HEIGHT - quoteBlockHeight) / 2 + quote.fontSize * 0.34

    ctx.fillStyle = themeInk(theme, 0.26)
    ctx.font = `700 132px ${fontFamily}`
    ctx.fillText('“', CARD_WIDTH / 2, quoteY - quote.fontSize * 0.9)

    ctx.fillStyle = themeInk(theme, 1)
    ctx.font = `700 ${quote.fontSize}px ${fontFamily}`
    for (const line of quote.lines) {
      ctx.fillText(line, CARD_WIDTH / 2, quoteY)
      quoteY += lineHeight
    }
  }

  // 하단 정보
  ctx.fillStyle = themeInk(theme, 0.92)
  ctx.font = `700 42px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, artwork.influencerName, contentWidth),
    CARD_WIDTH / 2,
    CARD_HEIGHT - 232,
  )

  ctx.fillStyle = themeInk(theme, 0.66)
  ctx.font = `500 30px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, translate('fanCardCanvas.t2', { p0: artwork.fanNickname }), contentWidth),
    CARD_WIDTH / 2,
    CARD_HEIGHT - 178,
  )
  ctx.fillText(artwork.dateLabel, CARD_WIDTH / 2, CARD_HEIGHT - 130)

  drawFooterMark(ctx, fontFamily, undefined, themeInk(theme, 0.42))
}

/** 카드 배경과 장식을 그린다. */
function drawBackground(ctx: CanvasRenderingContext2D, theme: FanCardTheme): void {
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT)
  gradient.addColorStop(0, theme.background[0])
  gradient.addColorStop(0.55, theme.background[1])
  gradient.addColorStop(1, theme.background[2])
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

  // 은은한 빛 번짐으로 단색 배경 느낌을 줄인다.
  const glow = ctx.createRadialGradient(
    CARD_WIDTH / 2, CARD_HEIGHT * 0.32, 40,
    CARD_WIDTH / 2, CARD_HEIGHT * 0.32, CARD_WIDTH * 0.72,
  )
  glow.addColorStop(0, themeInk(theme, 0.18))
  glow.addColorStop(1, themeInk(theme, 0))
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

  drawThemeOrnaments(ctx, theme, CARD_WIDTH, CARD_HEIGHT)

  // 카드 테두리
  ctx.strokeStyle = themeInk(theme, 0.28)
  ctx.lineWidth = 3
  ctx.strokeRect(36, 36, CARD_WIDTH - 72, CARD_HEIGHT - 72)
}

/**
 * 카드 하단에 서비스 표시를 남긴다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param fontFamily 사용할 폰트 패밀리
 * @param y 기준선 y좌표이며 레이아웃마다 하단 여백이 달라 조정한다
 * @param color 배경이 밝은 레이아웃에서는 어두운 색을 쓴다
 * @param centerX 가로 중심이며 카드 폭이 다른 레이아웃에서 지정한다
 */
function drawFooterMark(
  ctx: CanvasRenderingContext2D,
  fontFamily: string,
  y: number = CARD_HEIGHT - 74,
  color = 'rgba(255, 255, 255, 0.42)',
  centerX: number = CARD_WIDTH / 2,
): void {
  ctx.textAlign = 'center'
  ctx.fillStyle = color
  ctx.font = `600 26px ${fontFamily}`
  ctx.fillText('MELLY', centerX, y)
}

/**
 * 모서리가 둥근 사각형 경로를 만든다.
 *
 * @param ctx 경로를 만들 컨텍스트
 * @param x 왼쪽 좌표
 * @param y 위쪽 좌표
 * @param width 너비
 * @param height 높이
 * @param radius 모서리 반지름
 */
function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const limit = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + limit, y)
  ctx.lineTo(x + width - limit, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + limit)
  ctx.lineTo(x + width, y + height - limit)
  ctx.quadraticCurveTo(x + width, y + height, x + width - limit, y + height)
  ctx.lineTo(x + limit, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - limit)
  ctx.lineTo(x, y + limit)
  ctx.quadraticCurveTo(x, y, x + limit, y)
  ctx.closePath()
}

/**
 * 사진을 지정한 사각형에 **자르지 않고** 전부 담아 그린다.
 *
 * <p>통화 캡처는 가로 영상(상대 화면 + 셀프뷰)이라 칸 비율에 맞춰 잘라 내면 사람 얼굴이나
 * 셀프뷰 창이 통째로 잘려 나간다. 그래서 원본 전체를 비율대로 담고(contain), 남는 띠는
 * 같은 사진을 흐리게 확대한 채움으로 메워 빈 여백처럼 보이지 않게 한다.
 * 칸과 사진 비율이 같으면 채움이 완전히 덮여 이전과 똑같이 보인다.
 *
 * <p>팬이 배치를 손댄 경우에는 그 값만큼 키우고 밀어 그린다. 기본값은 확대율 1이라 아무것도
 * 하지 않으면 위 설명 그대로 전체가 담긴다. 얼굴을 크게 담고 싶은 팬은 키워서 원하는 부분만
 * 남길 수 있고, 그때는 칸을 넘어간 만큼만 밀 수 있다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param photo 그릴 사진
 * @param x 왼쪽 좌표
 * @param y 위쪽 좌표
 * @param width 채울 너비
 * @param height 채울 높이
 * @param radius 모서리 반지름이며 0이면 직각으로 그린다
 */
function drawPhotoCover(
  ctx: CanvasRenderingContext2D,
  photo: ImageBitmap,
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 0,
  adjustment?: PhotoAdjustment,
): void {
  ctx.save()
  if (radius > 0) {
    roundedRectPath(ctx, x, y, width, height, radius)
  } else {
    ctx.beginPath()
    ctx.rect(x, y, width, height)
  }
  ctx.clip()

  // 1) 배경 — 흐린 확대 채움. 블러가 가장자리에서 옅어지지 않게 살짝 키워 그린다.
  const coverScale = Math.max(width / photo.width, height / photo.height) * 1.12
  const coverWidth = photo.width * coverScale
  const coverHeight = photo.height * coverScale
  ctx.filter = 'blur(26px)'
  ctx.drawImage(
    photo,
    x + (width - coverWidth) / 2,
    y + (height - coverHeight) / 2,
    coverWidth,
    coverHeight,
  )
  ctx.filter = 'none'
  // 흐린 배경을 한 단계 눌러 원본 사진이 또렷하게 도드라지게 한다.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)'
  ctx.fillRect(x, y, width, height)

  // 2) 전경 — 기본은 원본 전체를 담고(contain), 팬이 키운 만큼만 확대한다. 손대지 않으면
  // zoom 이 1이라 사진이 잘리지 않고, 키우면 그만큼 칸을 넘어가며 배경 채움이 가려진다.
  const zoom = adjustment?.scale ?? 1
  const containScale = Math.min(width / photo.width, height / photo.height)
  const drawWidth = photo.width * containScale * zoom
  const drawHeight = photo.height * containScale * zoom
  // 칸을 넘어간 만큼만 밀 수 있다. 확대하지 않았으면 이동 여지가 없어 가운데에 머문다.
  // 레이아웃을 바꿔 칸 비율이 달라졌을 때 예전 이동량이 남아 사진이 밀리는 것도 여기서 막는다.
  const limits = photoOffsetLimits(width, height, photo.width, photo.height, zoom)
  const offsetX = Math.min(Math.max(adjustment?.offsetX ?? 0, -limits.x), limits.x)
  const offsetY = Math.min(Math.max(adjustment?.offsetY ?? 0, -limits.y), limits.y)
  ctx.drawImage(
    photo,
    x + (width - drawWidth) / 2 + offsetX * width,
    y + (height - drawHeight) / 2 + offsetY * height,
    drawWidth,
    drawHeight,
  )
  ctx.restore()
}


/**
 * 하트 모양 경로를 만든다. 사진을 이 모양으로 오려 붙이는 데 쓴다.
 *
 * <p>두 개의 곡선을 위에서 만나게 하고 아래를 한 점으로 모아 그린다. 좌표는 지정한 사각형 안에
 * 들어가도록 맞춘다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param x 왼쪽 좌표
 * @param y 위쪽 좌표
 * @param width 너비
 * @param height 높이
 */
function heartPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const centerX = x + width / 2
  const topY = y + height * 0.28
  ctx.beginPath()
  ctx.moveTo(centerX, y + height)
  ctx.bezierCurveTo(
    x - width * 0.08, y + height * 0.62,
    x + width * 0.1, y - height * 0.06,
    centerX, topY,
  )
  ctx.bezierCurveTo(
    x + width * 0.9, y - height * 0.06,
    x + width * 1.08, y + height * 0.62,
    centerX, y + height,
  )
  ctx.closePath()
}

/**
 * 사진을 원하는 모양으로 오려 붙인다.
 *
 * <p>둥근 사각형만 쓰던 drawPhotoCover 와 달리 경로를 호출 측이 정한다. 배치는 같은 규칙(원본
 * 전체를 담고 팬이 키운 만큼 확대)을 쓰므로 사진이 잘리는 정도도 사각형 칸과 같다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param photo 그릴 사진
 * @param x 왼쪽 좌표
 * @param y 위쪽 좌표
 * @param width 칸 너비
 * @param height 칸 높이
 * @param clip 오릴 모양을 그리는 함수
 * @param adjustment 팬이 정한 배치
 */
function drawPhotoInShape(
  ctx: CanvasRenderingContext2D,
  photo: ImageBitmap,
  x: number,
  y: number,
  width: number,
  height: number,
  clip: () => void,
  adjustment?: PhotoAdjustment,
): void {
  ctx.save()
  clip()
  ctx.clip()

  const zoom = adjustment?.scale ?? 1
  const contain = Math.min(width / photo.width, height / photo.height)
  const drawWidth = photo.width * contain * zoom
  const drawHeight = photo.height * contain * zoom
  const limits = photoOffsetLimits(width, height, photo.width, photo.height, zoom)
  const offsetX = Math.min(Math.max(adjustment?.offsetX ?? 0, -limits.x), limits.x)
  const offsetY = Math.min(Math.max(adjustment?.offsetY ?? 0, -limits.y), limits.y)

  // 오린 모양 안쪽을 먼저 채워, 사진이 모양보다 작을 때 배경이 그대로 비치지 않게 한다.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.12)'
  ctx.fillRect(x, y, width, height)
  ctx.drawImage(
    photo,
    x + (width - drawWidth) / 2 + offsetX * width,
    y + (height - drawHeight) / 2 + offsetY * height,
    drawWidth,
    drawHeight,
  )
  ctx.restore()
}

/**
 * 사진이 아직 없는 자리를 옅은 안내 칸으로 채운다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param x 왼쪽 좌표
 * @param y 위쪽 좌표
 * @param width 너비
 * @param height 높이
 * @param radius 모서리 반지름
 */
function drawEmptySlot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  theme: FanCardTheme = FAN_CARD_THEMES.NIGHT,
): void {
  roundedRectPath(ctx, x, y, width, height, radius)
  ctx.fillStyle = themeInk(theme, 0.06)
  ctx.fill()
  ctx.strokeStyle = theme.slot
  ctx.lineWidth = 2
  ctx.stroke()
}

/**
 * 여러 줄로 나눈 문구를 가운데 정렬로 그린다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param lines 그릴 줄 목록
 * @param fontSize 폰트 크기
 * @param startY 첫 줄의 기준선 y좌표
 * @param centerX 가로 중심이며 카드 폭이 다른 레이아웃에서 지정한다
 * @returns 마지막 줄 다음 기준선 y좌표
 */
function drawQuoteLines(
  ctx: CanvasRenderingContext2D,
  lines: readonly string[],
  fontSize: number,
  startY: number,
  centerX: number = CARD_WIDTH / 2,
): number {
  const lineHeight = fontSize * QUOTE_LINE_HEIGHT_RATIO
  let y = startY
  for (const line of lines) {
    ctx.fillText(line, centerX, y)
    y += lineHeight
  }
  return y
}

/**
 * SNS 게시물 느낌을 내는 아이콘들을 선으로 그린다.
 *
 * <p>외부 아이콘 파일을 쓰면 canvas가 오염되거나 로딩 순서에 걸리므로 전부 패스로 그린다.
 * 모양은 흔한 SNS 앱의 관용적 형태를 따르되 특정 서비스의 로고를 옮기지는 않는다.
 */
const SNS_ICON_LINE_WIDTH = 3

/**
 * 카메라 아이콘을 그린다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param x 아이콘 왼쪽 좌표
 * @param y 아이콘 위쪽 좌표
 * @param size 아이콘 한 변의 크기
 */
function drawCameraIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  const bodyY = y + size * 0.22
  const bodyHeight = size * 0.62
  roundedRectPath(ctx, x, bodyY, size, bodyHeight, size * 0.16)
  ctx.stroke()

  // 뷰파인더 돌출부
  ctx.beginPath()
  ctx.moveTo(x + size * 0.3, bodyY)
  ctx.lineTo(x + size * 0.38, y + size * 0.08)
  ctx.lineTo(x + size * 0.62, y + size * 0.08)
  ctx.lineTo(x + size * 0.7, bodyY)
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(x + size / 2, bodyY + bodyHeight / 2, size * 0.18, 0, Math.PI * 2)
  ctx.stroke()
}

/**
 * 종이비행기(보내기) 아이콘을 그린다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param x 아이콘 왼쪽 좌표
 * @param y 아이콘 위쪽 좌표
 * @param size 아이콘 한 변의 크기
 */
function drawPaperPlaneIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x, y + size * 0.44)
  ctx.lineTo(x + size, y)
  ctx.lineTo(x + size * 0.62, y + size)
  ctx.lineTo(x + size * 0.46, y + size * 0.6)
  ctx.closePath()
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(x + size * 0.46, y + size * 0.6)
  ctx.lineTo(x + size, y)
  ctx.stroke()
}

/**
 * 하트 아이콘을 그린다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param x 아이콘 왼쪽 좌표
 * @param y 아이콘 위쪽 좌표
 * @param size 아이콘 한 변의 크기
 * @param filled 채워서 그릴지 여부
 */
function drawHeartIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  filled = false,
): void {
  const centerX = x + size / 2
  const topY = y + size * 0.28
  ctx.beginPath()
  ctx.moveTo(centerX, y + size * 0.94)
  ctx.bezierCurveTo(x - size * 0.12, y + size * 0.52, x + size * 0.14, y - size * 0.06, centerX, topY)
  ctx.bezierCurveTo(
    x + size * 0.86, y - size * 0.06, x + size * 1.12, y + size * 0.52, centerX, y + size * 0.94,
  )
  ctx.closePath()
  if (filled) ctx.fill()
  else ctx.stroke()
}

/**
 * 말풍선(댓글) 아이콘을 그린다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param x 아이콘 왼쪽 좌표
 * @param y 아이콘 위쪽 좌표
 * @param size 아이콘 한 변의 크기
 */
function drawCommentIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  roundedRectPath(ctx, x, y + size * 0.08, size, size * 0.68, size * 0.24)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(x + size * 0.26, y + size * 0.76)
  ctx.lineTo(x + size * 0.24, y + size * 0.98)
  ctx.lineTo(x + size * 0.48, y + size * 0.76)
  ctx.stroke()
}

/**
 * 북마크(저장) 아이콘을 그린다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param x 아이콘 왼쪽 좌표
 * @param y 아이콘 위쪽 좌표
 * @param size 아이콘 한 변의 크기
 */
function drawBookmarkIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + size * 0.16, y)
  ctx.lineTo(x + size * 0.84, y)
  ctx.lineTo(x + size * 0.84, y + size)
  ctx.lineTo(x + size * 0.5, y + size * 0.72)
  ctx.lineTo(x + size * 0.16, y + size)
  ctx.closePath()
  ctx.stroke()
}

/**
 * 집(홈) 아이콘을 그린다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param x 아이콘 왼쪽 좌표
 * @param y 아이콘 위쪽 좌표
 * @param size 아이콘 한 변의 크기
 */
function drawHomeIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x, y + size * 0.44)
  ctx.lineTo(x + size / 2, y + size * 0.04)
  ctx.lineTo(x + size, y + size * 0.44)
  ctx.lineTo(x + size, y + size * 0.96)
  ctx.lineTo(x, y + size * 0.96)
  ctx.closePath()
  ctx.stroke()
}

/**
 * 돋보기(검색) 아이콘을 그린다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param x 아이콘 왼쪽 좌표
 * @param y 아이콘 위쪽 좌표
 * @param size 아이콘 한 변의 크기
 */
function drawSearchIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  ctx.beginPath()
  ctx.arc(x + size * 0.42, y + size * 0.42, size * 0.34, 0, Math.PI * 2)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(x + size * 0.68, y + size * 0.68)
  ctx.lineTo(x + size * 0.98, y + size * 0.98)
  ctx.stroke()
}

/**
 * 네 칸 격자 아이콘을 그린다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param x 아이콘 왼쪽 좌표
 * @param y 아이콘 위쪽 좌표
 * @param size 아이콘 한 변의 크기
 */
function drawGridIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  const cell = size * 0.42
  const gap = size - cell * 2
  // as const 로 튜플임을 확정해야 구조분해한 좌표에 undefined가 붙지 않는다.
  for (const [column, row] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
    roundedRectPath(
      ctx, x + column * (cell + gap), y + row * (cell + gap), cell, cell, size * 0.09,
    )
    ctx.stroke()
  }
}

/**
 * 사람(프로필) 아이콘을 그린다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param x 아이콘 왼쪽 좌표
 * @param y 아이콘 위쪽 좌표
 * @param size 아이콘 한 변의 크기
 */
function drawProfileIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  ctx.beginPath()
  ctx.arc(x + size / 2, y + size * 0.3, size * 0.26, 0, Math.PI * 2)
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(x + size / 2, y + size * 1.06, size * 0.46, Math.PI * 1.15, Math.PI * 1.85)
  ctx.stroke()
}

/**
 * 더보기(점 세 개) 아이콘을 그린다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param x 아이콘 왼쪽 좌표
 * @param centerY 점의 세로 중심
 * @param size 아이콘 가로 크기
 */
function drawDotsIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  centerY: number,
  size: number,
): void {
  const radius = size * 0.09
  for (let index = 0; index < 3; index += 1) {
    ctx.beginPath()
    ctx.arc(x + radius + index * (size * 0.42), centerY, radius, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * 인스타그램 게시물 프레임을 닮은 카드를 그린다.
 *
 * <p>파스텔 배경 위에 흰 게시물 카드를 올리고 캡션 자리에 통화 문구를 넣는다. 팬이 그대로
 * SNS에 올리기 좋은 형태다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param artwork 카드에 담을 정보
 * @param photos 합성할 사진이며 첫 장만 쓴다
 * @param fontFamily 사용할 폰트 패밀리
 */
function drawInstaCard(
  ctx: CanvasRenderingContext2D,
  artwork: FanCardArtwork,
  photos: readonly ImageBitmap[],
  fontFamily: string,
): PhotoSlotRect[] {
  const theme = themeOf(artwork.themeKey)
  const slots: PhotoSlotRect[] = []
  // 바탕 — 도안 색을 따라간다. 위에 올리는 흰 게시물 카드와 그 안 글자는 도안과 무관하게
  // 흰 종이 위 검은 글씨라 그대로 둔다.
  const background = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT)
  background.addColorStop(0, theme.background[0])
  background.addColorStop(0.5, theme.background[1])
  background.addColorStop(1, theme.background[2])
  ctx.fillStyle = background
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
  drawThemeOrnaments(ctx, theme, CARD_WIDTH, CARD_HEIGHT)

  const frameX = 40
  const frameY = 40
  const frameWidth = CARD_WIDTH - frameX * 2
  const frameHeight = CARD_HEIGHT - frameY * 2
  const inset = 36

  // 게시물 프레임
  ctx.save()
  ctx.shadowColor = 'rgba(63, 28, 87, 0.2)'
  ctx.shadowBlur = 34
  ctx.shadowOffsetY = 12
  roundedRectPath(ctx, frameX, frameY, frameWidth, frameHeight, 14)
  ctx.fillStyle = themeInk(theme, 1)
  ctx.fill()
  ctx.restore()

  const ink = '#1f1430'
  ctx.strokeStyle = ink
  ctx.lineWidth = SNS_ICON_LINE_WIDTH
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // 상단 바 — 카메라 · 로고 · 보내기
  const topBarHeight = 90
  const topIconSize = 38
  const topIconY = frameY + (topBarHeight - topIconSize) / 2
  drawCameraIcon(ctx, frameX + inset, topIconY, topIconSize)
  drawPaperPlaneIcon(ctx, frameX + frameWidth - inset - topIconSize, topIconY, topIconSize)

  // 로고 자리 — 특정 서비스 상표 대신 서비스명을 필기체 계열로 넣는다.
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = ink
  ctx.font = `italic 700 42px "Segoe Script", "Brush Script MT", ${fontFamily}`
  ctx.fillText('MELLY', CARD_WIDTH / 2, frameY + topBarHeight / 2)

  // 계정 줄 — 아바타 · 이름 · 더보기
  const accountTop = frameY + topBarHeight
  const accountHeight = 76
  const accountCenterY = accountTop + accountHeight / 2
  const avatarRadius = 23
  const avatarCenterX = frameX + inset + avatarRadius

  const avatarGradient = ctx.createLinearGradient(
    avatarCenterX - avatarRadius, accountCenterY - avatarRadius,
    avatarCenterX + avatarRadius, accountCenterY + avatarRadius,
  )
  avatarGradient.addColorStop(0, '#8e3b74')
  avatarGradient.addColorStop(1, '#5b2a86')
  ctx.beginPath()
  ctx.arc(avatarCenterX, accountCenterY, avatarRadius, 0, Math.PI * 2)
  ctx.fillStyle = avatarGradient
  ctx.fill()

  ctx.fillStyle = themeInk(theme, 1)
  ctx.font = `700 24px ${fontFamily}`
  ctx.fillText([...artwork.influencerName][0] ?? 'M', avatarCenterX, accountCenterY + 1)

  const nameX = avatarCenterX + avatarRadius + 18
  const nameMaxWidth = frameX + frameWidth - inset - 60 - nameX
  ctx.textAlign = 'left'
  ctx.fillStyle = ink
  ctx.font = `700 28px ${fontFamily}`
  ctx.fillText(truncate(ctx, artwork.influencerName, nameMaxWidth), nameX, accountCenterY + 1)

  ctx.fillStyle = ink
  drawDotsIcon(ctx, frameX + frameWidth - inset - 34, accountCenterY, 34)

  // 사진 — 통화 화면이 가로 영상이라 정사각보다 조금 낮게 잡아 덜 잘리게 한다.
  const photoTop = accountTop + accountHeight
  const photoHeight = 860
  const photo = photos[0]
  slots.push({ index: 0, x: frameX, y: photoTop, width: frameWidth, height: photoHeight })
  if (photo) {
    drawPhotoCover(
      ctx, photo, frameX, photoTop, frameWidth, photoHeight, 0, artwork.photoAdjustments?.[0],
    )
  } else {
    drawEmptySlot(ctx, frameX, photoTop, frameWidth, photoHeight, 0, theme)
  }

  // 액션 바 — 좋아요 · 댓글 · 공유 · 저장
  const actionTop = photoTop + photoHeight
  const actionHeight = 66
  const actionIconSize = 38
  const actionIconY = actionTop + (actionHeight - actionIconSize) / 2
  ctx.strokeStyle = ink
  ctx.lineWidth = SNS_ICON_LINE_WIDTH

  ctx.fillStyle = '#ff3b5c'
  drawHeartIcon(ctx, frameX + inset, actionIconY, actionIconSize, true)
  drawCommentIcon(ctx, frameX + inset + 64, actionIconY, actionIconSize)
  drawPaperPlaneIcon(ctx, frameX + inset + 128, actionIconY, actionIconSize)
  drawBookmarkIcon(
    ctx, frameX + frameWidth - inset - actionIconSize, actionIconY, actionIconSize,
  )

  // 캡션 — 계정명에 이어 문구를 쓰는 게시물 형식이다. 문구를 고르지 않았으면 비워 둔다.
  const captionTop = actionTop + actionHeight
  const captionHeight = 118
  const captionWidth = frameWidth - inset * 2
  const quoteText = cardQuoteText(artwork)

  if (quoteText) {
    const quote = fitQuote(
      ctx, quoteText, fontFamily, captionWidth, 78, [30, 27, 24, 22, 20], artwork.quoteScale,
    )

    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = ink
    ctx.font = `500 ${quote.fontSize}px ${fontFamily}`
    let captionY = captionTop + 34
    const captionLineHeight = quote.fontSize * QUOTE_LINE_HEIGHT_RATIO
    for (const line of quote.lines) {
      ctx.fillText(line, frameX + inset, captionY)
      captionY += captionLineHeight
    }
  }

  // 문구를 건너뛰어도 뒤이어 그리는 글자가 같은 기준으로 놓이도록 정렬을 되돌린다.
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = 'rgba(31, 20, 48, 0.45)'
  ctx.font = `500 21px ${fontFamily}`
  ctx.fillText(
    truncate(
      ctx,
      `${artwork.fanNickname} · ${artwork.meetingTitle} · ${artwork.dateLabel}`,
      captionWidth,
    ),
    frameX + inset,
    captionTop + captionHeight - 12,
  )

  // 하단 탐색 바
  const navTop = captionTop + captionHeight
  const navHeight = 60
  const navIconSize = 32
  const navIconY = navTop + (navHeight - navIconSize) / 2
  const navInset = 74
  const navSpan = frameWidth - navInset * 2
  const navIcons = [drawHomeIcon, drawSearchIcon, drawGridIcon, drawHeartIcon, drawProfileIcon]

  ctx.strokeStyle = ink
  ctx.lineWidth = 2.5
  navIcons.forEach((drawIcon, index) => {
    const centerX = frameX + navInset + (navSpan / (navIcons.length - 1)) * index
    drawIcon(ctx, centerX - navIconSize / 2, navIconY, navIconSize)
  })

  return slots
}

/**
 * 폴라로이드 사진을 닮은 카드를 그린다.
 *
 * <p>아래 여백에 문구와 이름을 사인처럼 남겨 소장용 굿즈 인상을 준다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param artwork 카드에 담을 정보
 * @param photos 합성할 사진이며 첫 장만 쓴다
 * @param fontFamily 사용할 폰트 패밀리
 */
function drawPolaroidCard(
  ctx: CanvasRenderingContext2D,
  artwork: FanCardArtwork,
  photos: readonly ImageBitmap[],
  fontFamily: string,
): PhotoSlotRect[] {
  const theme = themeOf(artwork.themeKey)
  const slots: PhotoSlotRect[] = []
  // 바탕 — 도안 색을 따라간다. 흰 폴라로이드 종이는 도안과 무관하게 그대로 둔다.
  const background = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT)
  background.addColorStop(0, theme.background[0])
  background.addColorStop(0.6, theme.background[1])
  background.addColorStop(1, theme.background[2])
  ctx.fillStyle = background
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
  drawThemeOrnaments(ctx, theme, CARD_WIDTH, CARD_HEIGHT)

  const frameX = 90
  const frameY = 80
  const frameWidth = CARD_WIDTH - frameX * 2
  const photoInset = 45
  const photoSize = frameWidth - photoInset * 2
  const captionHeight = 300
  const frameHeight = photoInset + photoSize + captionHeight

  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'
  ctx.shadowBlur = 40
  ctx.shadowOffsetY = 16
  roundedRectPath(ctx, frameX, frameY, frameWidth, frameHeight, 10)
  ctx.fillStyle = '#fdfcf8'
  ctx.fill()
  ctx.restore()

  const photo = photos[0]
  slots.push({
    index: 0,
    x: frameX + photoInset,
    y: frameY + photoInset,
    width: photoSize,
    height: photoSize,
  })
  if (photo) {
    drawPhotoCover(
      ctx, photo, frameX + photoInset, frameY + photoInset, photoSize, photoSize, 0,
      artwork.photoAdjustments?.[0],
    )
  } else {
    drawEmptySlot(
      ctx, frameX + photoInset, frameY + photoInset, photoSize, photoSize, 0, theme,
    )
  }

  // 아래 여백 — 문구를 손글씨처럼 기울여 사인 느낌을 준다. 문구를 고르지 않았으면 비워 둔다.
  const captionTop = frameY + photoInset + photoSize
  const captionWidth = photoSize
  const quoteText = cardQuoteText(artwork)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  if (quoteText) {
    const quote = fitQuote(
      ctx, quoteText, fontFamily, captionWidth, 130, [46, 40, 35, 30, 26], artwork.quoteScale,
    )
    ctx.save()
    ctx.translate(CARD_WIDTH / 2, captionTop + 74)
    ctx.rotate(-0.022)
    ctx.fillStyle = '#2a1547'
    ctx.font = `700 ${quote.fontSize}px ${fontFamily}`
    let quoteY = 0
    const lineHeight = quote.fontSize * QUOTE_LINE_HEIGHT_RATIO
    for (const line of quote.lines) {
      ctx.fillText(line, 0, quoteY)
      quoteY += lineHeight
    }
    ctx.restore()
  }

  ctx.fillStyle = 'rgba(42, 21, 71, 0.9)'
  ctx.font = `700 34px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, artwork.influencerName, captionWidth),
    CARD_WIDTH / 2,
    frameY + frameHeight - 96,
  )

  ctx.fillStyle = 'rgba(42, 21, 71, 0.55)'
  ctx.font = `500 26px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, `${artwork.fanNickname} · ${artwork.dateLabel}`, captionWidth),
    CARD_WIDTH / 2,
    frameY + frameHeight - 52,
  )

  ctx.fillStyle = themeInk(theme, 0.5)
  ctx.font = `500 24px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, artwork.meetingTitle, CARD_WIDTH - 160),
    CARD_WIDTH / 2,
    frameY + frameHeight + 62,
  )

  drawFooterMark(ctx, fontFamily, CARD_HEIGHT - 34, themeInk(theme, 0.42))

  return slots
}

/**
 * 통화 중 여러 순간을 2×2로 모은 네컷 카드를 그린다.
 *
 * <p>사진이 네 장보다 적으면 남는 칸은 빈 자리로 남겨 두고 예외를 던지지 않는다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param artwork 카드에 담을 정보
 * @param photos 합성할 사진이며 앞 네 장을 쓴다
 * @param fontFamily 사용할 폰트 패밀리
 */
function drawFourCutCard(
  ctx: CanvasRenderingContext2D,
  artwork: FanCardArtwork,
  photos: readonly ImageBitmap[],
  fontFamily: string,
): PhotoSlotRect[] {
  const theme = themeOf(artwork.themeKey)
  const slots: PhotoSlotRect[] = []
  drawFourCutBackground(ctx, theme)

  // 상단 제목
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = themeInk(theme, 0.72)
  ctx.font = `600 30px ${fontFamily}`
  ctx.fillText(truncate(ctx, artwork.meetingTitle, CARD_WIDTH - 200), CARD_WIDTH / 2, 104)

  // 2×2 그리드
  const gridX = 72
  const gridY = 148
  const gap = 24
  const slotSize = (CARD_WIDTH - gridX * 2 - gap) / 2

  for (let index = 0; index < FOUR_CUT_SLOTS; index += 1) {
    const column = index % 2
    const row = Math.floor(index / 2)
    const x = gridX + column * (slotSize + gap)
    const y = gridY + row * (slotSize + gap)
    const photo = photos[index]

    slots.push({ index, x, y, width: slotSize, height: slotSize })
    if (photo) {
      drawPhotoCover(ctx, photo, x, y, slotSize, slotSize, 16, artwork.photoAdjustments?.[index])
    } else {
      drawEmptySlot(ctx, x, y, slotSize, slotSize, 16, theme)
    }
  }

  // 문구 — 고르지 않았으면 사진 아래를 비워 팬이 꾸밀 자리로 남긴다.
  const gridBottom = gridY + slotSize * 2 + gap
  const quoteText = cardQuoteText(artwork)
  if (quoteText) {
    const quote = fitQuote(
      ctx, `“${quoteText}”`, fontFamily, CARD_WIDTH - 200, 110, [40, 35, 31, 27, 24], artwork.quoteScale,
    )
    ctx.fillStyle = themeInk(theme, 1)
    ctx.font = `700 ${quote.fontSize}px ${fontFamily}`
    drawQuoteLines(ctx, quote.lines, quote.fontSize, gridBottom + 62)
  }

  // 하단 정보
  ctx.fillStyle = themeInk(theme, 0.88)
  ctx.font = `700 32px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, artwork.influencerName, CARD_WIDTH - 200),
    CARD_WIDTH / 2,
    CARD_HEIGHT - 116,
  )

  ctx.fillStyle = themeInk(theme, 0.6)
  ctx.font = `500 26px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, `${artwork.fanNickname} · ${artwork.dateLabel}`, CARD_WIDTH - 200),
    CARD_WIDTH / 2,
    CARD_HEIGHT - 74,
  )

  drawFooterMark(ctx, fontFamily, CARD_HEIGHT - 40, themeInk(theme, 0.42))

  return slots
}

/**
 * 네컷 계열이 공유하는 어두운 배경과 테두리를 그린다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param width 카드 너비
 * @param height 카드 높이
 * @param inset 테두리를 안쪽으로 들일 거리
 */
function drawFourCutBackground(
  ctx: CanvasRenderingContext2D,
  theme: FanCardTheme,
  width: number = CARD_WIDTH,
  height: number = CARD_HEIGHT,
  inset = 30,
): void {
  const background = ctx.createLinearGradient(0, 0, width, height)
  background.addColorStop(0, theme.background[0])
  background.addColorStop(0.55, theme.background[1])
  background.addColorStop(1, theme.background[2])
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)

  drawThemeOrnaments(ctx, theme, width, height)

  ctx.strokeStyle = themeInk(theme, 0.22)
  ctx.lineWidth = 3
  ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2)
}

/**
 * 네 칸을 세로로 쌓은 스트립형 네컷 카드를 그린다.
 *
 * <p>즉석사진 부스에서 뽑는 세로 스트립을 닮았다. 칸은 통화 화면과 같은 가로 비율이라
 * 얼굴이 덜 잘리고, 글자는 스트립 위아래에만 둬 세로로 흐르는 형태를 지킨다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param artwork 카드에 담을 정보
 * @param photos 합성할 사진이며 앞 네 장을 쓴다
 * @param fontFamily 사용할 폰트 패밀리
 */
function drawFourCutVerticalCard(
  ctx: CanvasRenderingContext2D,
  artwork: FanCardArtwork,
  photos: readonly ImageBitmap[],
  fontFamily: string,
): PhotoSlotRect[] {
  const theme = themeOf(artwork.themeKey)
  const slots: PhotoSlotRect[] = []
  const { width, height } = FOURCUT_VERTICAL_SIZE
  const centerX = width / 2
  const padding = 24
  const contentWidth = width - padding * 2

  drawFourCutBackground(ctx, theme, width, height, 14)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  // 상단 — 제목과 문구만 둔다.
  ctx.fillStyle = themeInk(theme, 0.7)
  ctx.font = `600 24px ${fontFamily}`
  ctx.fillText(truncate(ctx, artwork.meetingTitle, contentWidth), centerX, 58)

  // 문구를 고르지 않았으면 스트립 위를 비운다. 칸 위치는 그대로라 사진 배치는 달라지지 않는다.
  const quoteText = cardQuoteText(artwork)
  if (quoteText) {
    const quote = fitQuote(
      ctx, `“${quoteText}”`, fontFamily, contentWidth, 96, [30, 27, 24, 21, 19], artwork.quoteScale,
    )
    ctx.fillStyle = themeInk(theme, 1)
    ctx.font = `700 ${quote.fontSize}px ${fontFamily}`
    drawQuoteLines(ctx, quote.lines, quote.fontSize, 104, centerX)
  }

  // 세로 스트립 — 칸이 카드 폭을 꽉 채워 좌우에 빈 공간이 없다.
  const gap = 10
  const slotWidth = contentWidth
  const slotHeight = Math.round((slotWidth * 9) / 16)
  const stripTop = 200

  for (let index = 0; index < FOUR_CUT_SLOTS; index += 1) {
    const y = stripTop + index * (slotHeight + gap)
    const photo = photos[index]
    slots.push({ index, x: padding, y, width: slotWidth, height: slotHeight })
    if (photo) {
      drawPhotoCover(
        ctx, photo, padding, y, slotWidth, slotHeight, 10, artwork.photoAdjustments?.[index],
      )
    } else {
      drawEmptySlot(ctx, padding, y, slotWidth, slotHeight, 10, theme)
    }
  }

  // 하단 서명 — 스트립 바로 아래에 붙인다.
  const stripBottom = stripTop + FOUR_CUT_SLOTS * slotHeight + (FOUR_CUT_SLOTS - 1) * gap

  ctx.fillStyle = themeInk(theme, 0.88)
  ctx.font = `700 28px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, artwork.influencerName, contentWidth), centerX, stripBottom + 48,
  )

  ctx.fillStyle = themeInk(theme, 0.6)
  ctx.font = `500 22px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, `${artwork.fanNickname} · ${artwork.dateLabel}`, contentWidth),
    centerX,
    stripBottom + 84,
  )

  drawFooterMark(ctx, fontFamily, stripBottom + 122, themeInk(theme, 0.42), centerX)

  return slots
}

/**
 * 네 칸을 가로로 늘어놓은 스트립형 네컷 카드를 그린다.
 *
 * <p>칸이 세로로 긴 형태라 인물 사진에 어울린다. 글자는 스트립 위아래에만 둬 가로로
 * 늘어선 형태를 지키고, 스트립 아래는 팬이 나중에 꾸밀 자리로 남긴다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param artwork 카드에 담을 정보
 * @param photos 합성할 사진이며 앞 네 장을 쓴다
 * @param fontFamily 사용할 폰트 패밀리
 */
function drawFourCutHorizontalCard(
  ctx: CanvasRenderingContext2D,
  artwork: FanCardArtwork,
  photos: readonly ImageBitmap[],
  fontFamily: string,
): PhotoSlotRect[] {
  const theme = themeOf(artwork.themeKey)
  const slots: PhotoSlotRect[] = []
  const { width, height } = FOURCUT_HORIZONTAL_SIZE
  const centerX = width / 2
  const padding = 24
  const contentWidth = width - padding * 2

  drawFourCutBackground(ctx, theme, width, height, 14)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  // 상단 — 제목과 문구만 둔다.
  ctx.fillStyle = themeInk(theme, 0.7)
  ctx.font = `600 24px ${fontFamily}`
  ctx.fillText(truncate(ctx, artwork.meetingTitle, contentWidth), centerX, 56)

  // 문구를 고르지 않았으면 스트립 위를 비운다. 칸 위치는 그대로라 사진 배치는 달라지지 않는다.
  const quoteText = cardQuoteText(artwork)
  if (quoteText) {
    const quote = fitQuote(
      ctx, `“${quoteText}”`, fontFamily, contentWidth, 96, [34, 30, 27, 24, 21], artwork.quoteScale,
    )
    ctx.fillStyle = themeInk(theme, 1)
    ctx.font = `700 ${quote.fontSize}px ${fontFamily}`
    drawQuoteLines(ctx, quote.lines, quote.fontSize, 102, centerX)
  }

  // 가로 스트립 — 칸이 카드 폭을 꽉 채워 좌우에 빈 공간이 없다.
  const gap = 12
  const slotWidth = (contentWidth - gap * (FOUR_CUT_SLOTS - 1)) / FOUR_CUT_SLOTS
  const slotHeight = Math.round((slotWidth * 16) / 9)
  const stripTop = 196

  for (let index = 0; index < FOUR_CUT_SLOTS; index += 1) {
    const x = padding + index * (slotWidth + gap)
    const photo = photos[index]
    slots.push({ index, x, y: stripTop, width: slotWidth, height: slotHeight })
    if (photo) {
      drawPhotoCover(
        ctx, photo, x, stripTop, slotWidth, slotHeight, 10, artwork.photoAdjustments?.[index],
      )
    } else {
      drawEmptySlot(ctx, x, stripTop, slotWidth, slotHeight, 10, theme)
    }
  }

  // 하단 서명 — 스트립 바로 아래에 붙인다.
  const stripBottom = stripTop + slotHeight

  ctx.fillStyle = themeInk(theme, 0.88)
  ctx.font = `700 28px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, artwork.influencerName, contentWidth), centerX, stripBottom + 48,
  )

  ctx.fillStyle = themeInk(theme, 0.6)
  ctx.font = `500 22px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, `${artwork.fanNickname} · ${artwork.dateLabel}`, contentWidth),
    centerX,
    stripBottom + 84,
  )

  drawFooterMark(ctx, fontFamily, stripBottom + 122, themeInk(theme, 0.42), centerX)

  return slots
}

/**
 * 이미 불러온 스티커 그림을 코드별로 재사용한다.
 *
 * <p>같은 스티커를 여러 개 붙이거나 위치를 옮길 때마다 다시 내려받지 않게 한다.
 */
const stickerImageCache = new Map<string, Promise<HTMLImageElement>>()

/**
 * 스티커 SVG를 그림으로 불러온다.
 *
 * <p>같은 출처의 파일이라 캔버스가 오염되지 않으므로 합성한 카드를 그대로 PNG로 저장할 수
 * 있다. 실패하면 캐시에서 지워 다음에 다시 시도한다.
 *
 * @param code 불러올 스티커 코드
 * @returns 그릴 준비가 끝난 그림
 * @throws Error 그림을 불러오지 못한 경우
 */
function loadStickerImage(code: string): Promise<HTMLImageElement> {
  const cached = stickerImageCache.get(code)
  if (cached) return cached

  const loading = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.addEventListener('load', () => resolve(image), { once: true })
    image.addEventListener(
      'error',
      () => reject(new Error(translate('fanCardCanvas.t3'))),
      { once: true },
    )
    image.src = cardStickerUrl(code)
  })

  stickerImageCache.set(code, loading)
  void loading.catch(() => stickerImageCache.delete(code))
  return loading
}

/**
 * 팬이 얹은 스티커와 글자를 카드 위에 그린다.
 *
 * <p>그림을 먼저 모두 불러온 뒤 한 번에 그린다. 그리는 도중에 기다리면 캔버스 상태를
 * 저장·복원하는 사이에 다른 그리기가 끼어들 수 있기 때문이다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param decorations 팬이 얹은 요소이며 앞에서부터 아래에 깔린다
 * @param fontFamily 글자 요소에 쓸 글꼴
 */
async function drawDecorations(
  ctx: CanvasRenderingContext2D,
  decorations: readonly CardDecoration[],
  fontFamily: string,
): Promise<void> {
  const images = await Promise.all(
    decorations.map((decoration) =>
      decoration.kind === 'STICKER'
        // 한 장을 못 불러와도 나머지는 그린다.
        ? loadStickerImage(decoration.content).catch(() => undefined)
        : Promise.resolve(undefined),
    ),
  )

  decorations.forEach((decoration, index) => {
    ctx.save()
    ctx.translate(decoration.x, decoration.y)
    ctx.rotate(decoration.rotation)

    if (decoration.kind === 'TEXT') {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `700 ${decoration.size}px ${fontFamily}`
      // 밝은 프레임과 어두운 네컷 어디에 올려도 읽히도록 테두리를 함께 그린다.
      ctx.lineJoin = 'round'
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)'
      ctx.lineWidth = Math.max(2, decoration.size * 0.14)
      ctx.strokeText(decoration.content, 0, 0)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(decoration.content, 0, 0)
    } else {
      const image = images[index]
      if (image) {
        const half = decoration.size / 2
        ctx.drawImage(image, -half, -half, decoration.size, decoration.size)
      }
    }

    ctx.restore()
  })
}

/**
 * 한 줄에 담기지 않는 문구를 줄임표로 자른다.
 *
 * @param ctx 폭 계산에 사용할 컨텍스트이며 font가 설정되어 있어야 한다
 * @param text 자를 문구
 * @param maxWidth 허용 폭
 * @returns 허용 폭에 맞게 자른 문구
 */
function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text

  let result = ''
  for (const char of text) {
    if (ctx.measureText(`${result}${char}…`).width > maxWidth) break
    result += char
  }
  return `${result}…`
}

/**
 * 사진 여섯 장을 2×3 격자로 담는 카드를 그린다.
 *
 * <p>네컷보다 한 통화의 장면을 더 많이 남길 수 있다. 칸을 가로로 눕혀 통화 캡처(가로 영상)와
 * 비율이 가까우므로, 기본 배치에서 위아래 띠가 얇게 남는다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param artwork 카드에 담을 정보
 * @param photos 담을 사진 목록
 * @param fontFamily 사용할 폰트 패밀리
 * @returns 사진이 놓인 칸 목록
 */
function drawSixCutCard(
  ctx: CanvasRenderingContext2D,
  artwork: FanCardArtwork,
  photos: readonly ImageBitmap[],
  fontFamily: string,
): PhotoSlotRect[] {
  const theme = themeOf(artwork.themeKey)
  const slots: PhotoSlotRect[] = []
  drawFourCutBackground(ctx, theme)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = themeInk(theme, 0.72)
  ctx.font = `600 30px ${fontFamily}`
  ctx.fillText(truncate(ctx, artwork.meetingTitle, CARD_WIDTH - 200), CARD_WIDTH / 2, 96)

  const gridX = 66
  const gridY = 132
  const gap = 18
  const slotWidth = (CARD_WIDTH - gridX * 2 - gap) / 2
  const slotHeight = Math.round((slotWidth * 9) / 16)

  for (let index = 0; index < SIX_CUT_SLOTS; index += 1) {
    const column = index % 2
    const row = Math.floor(index / 2)
    const x = gridX + column * (slotWidth + gap)
    const y = gridY + row * (slotHeight + gap)
    const photo = photos[index]

    slots.push({ index, x, y, width: slotWidth, height: slotHeight })
    if (photo) {
      drawPhotoCover(ctx, photo, x, y, slotWidth, slotHeight, 14, artwork.photoAdjustments?.[index])
    } else {
      drawEmptySlot(ctx, x, y, slotWidth, slotHeight, 14, theme)
    }
  }

  const gridBottom = gridY + slotHeight * 3 + gap * 2
  const quoteText = cardQuoteText(artwork)
  if (quoteText) {
    const quote = fitQuote(
      ctx, `“${quoteText}”`, fontFamily, CARD_WIDTH - 200, 96, [36, 32, 28, 25, 22],
      artwork.quoteScale,
    )
    ctx.fillStyle = themeInk(theme, 1)
    ctx.font = `700 ${quote.fontSize}px ${fontFamily}`
    drawQuoteLines(ctx, quote.lines, quote.fontSize, gridBottom + 54)
  }

  ctx.fillStyle = themeInk(theme, 0.88)
  ctx.font = `700 30px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, artwork.influencerName, CARD_WIDTH - 200),
    CARD_WIDTH / 2,
    CARD_HEIGHT - 108,
  )
  ctx.fillStyle = themeInk(theme, 0.6)
  ctx.font = `500 25px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, `${artwork.fanNickname} · ${artwork.dateLabel}`, CARD_WIDTH - 200),
    CARD_WIDTH / 2,
    CARD_HEIGHT - 70,
  )
  drawFooterMark(ctx, fontFamily, CARD_HEIGHT - 38, themeInk(theme, 0.42))

  return slots
}

/**
 * 사진 네 장을 필름 한 롤처럼 담는 카드를 그린다.
 *
 * <p>세로 스트립과 칸 배치는 같지만, 좌우에 필름 구멍을 그려 잘라 낸 필름 조각처럼 보이게 한다.
 * 즉석 사진 부스에서 뽑은 느낌을 살리려는 도안이다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param artwork 카드에 담을 정보
 * @param photos 담을 사진 목록
 * @param fontFamily 사용할 폰트 패밀리
 * @returns 사진이 놓인 칸 목록
 */
function drawFilmCard(
  ctx: CanvasRenderingContext2D,
  artwork: FanCardArtwork,
  photos: readonly ImageBitmap[],
  fontFamily: string,
): PhotoSlotRect[] {
  const theme = themeOf(artwork.themeKey)
  const slots: PhotoSlotRect[] = []
  const { width, height } = FILM_SIZE

  // 필름 베이스 — 사진 인화지가 아니라 필름이므로 거의 검게 둔다.
  ctx.fillStyle = '#151517'
  ctx.fillRect(0, 0, width, height)

  // 좌우 구멍(퍼포레이션) — 같은 간격으로 위에서 아래까지 낸다.
  const holeWidth = 26
  const holeHeight = 34
  const holeGap = 26
  const margin = 22
  ctx.fillStyle = 'rgba(245, 245, 240, 0.92)'
  for (let y = margin; y + holeHeight <= height - margin; y += holeHeight + holeGap) {
    roundedRectPath(ctx, margin, y, holeWidth, holeHeight, 6)
    ctx.fill()
    roundedRectPath(ctx, width - margin - holeWidth, y, holeWidth, holeHeight, 6)
    ctx.fill()
  }

  const padding = margin + holeWidth + 18
  const contentWidth = width - padding * 2
  const gap = 12
  const slotWidth = contentWidth
  const slotHeight = Math.round((slotWidth * 9) / 16)
  const stripTop = 112

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = themeInk(theme, 0.62)
  ctx.font = `600 24px ${fontFamily}`
  ctx.fillText(truncate(ctx, artwork.meetingTitle, contentWidth), width / 2, 74)

  for (let index = 0; index < FOUR_CUT_SLOTS; index += 1) {
    const y = stripTop + index * (slotHeight + gap)
    const photo = photos[index]
    slots.push({ index, x: padding, y, width: slotWidth, height: slotHeight })
    if (photo) {
      drawPhotoCover(
        ctx, photo, padding, y, slotWidth, slotHeight, 4, artwork.photoAdjustments?.[index],
      )
    } else {
      drawEmptySlot(ctx, padding, y, slotWidth, slotHeight, 4, theme)
    }
  }

  const stripBottom = stripTop + FOUR_CUT_SLOTS * slotHeight + (FOUR_CUT_SLOTS - 1) * gap
  const quoteText = cardQuoteText(artwork)
  if (quoteText) {
    const quote = fitQuote(
      ctx, quoteText, fontFamily, contentWidth, 92, [30, 27, 24, 21, 19], artwork.quoteScale,
    )
    ctx.fillStyle = themeInk(theme, 0.94)
    ctx.font = `700 ${quote.fontSize}px ${fontFamily}`
    drawQuoteLines(ctx, quote.lines, quote.fontSize, stripBottom + 48, width / 2)
  }

  ctx.fillStyle = themeInk(theme, 0.8)
  ctx.font = `700 24px ${fontFamily}`
  ctx.fillText(truncate(ctx, artwork.influencerName, contentWidth), width / 2, height - 84)
  ctx.fillStyle = themeInk(theme, 0.52)
  ctx.font = `500 20px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, `${artwork.fanNickname} · ${artwork.dateLabel}`, contentWidth),
    width / 2,
    height - 54,
  )
  drawFooterMark(ctx, fontFamily, height - 26, themeInk(theme, 0.42))

  return slots
}

/**
 * 사진 두 장을 위아래로 크게 담는 카드를 그린다.
 *
 * <p>네컷은 한 칸이 작아 표정이 잘 안 보인다. 장면을 두 개만 고르는 대신 크게 남기고 싶을 때
 * 쓴다. 칸을 가로로 눕혀 통화 캡처 비율과 가깝게 뒀다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param artwork 카드에 담을 정보
 * @param photos 담을 사진 목록
 * @param fontFamily 사용할 폰트 패밀리
 * @returns 사진이 놓인 칸 목록
 */
function drawTwoCutCard(
  ctx: CanvasRenderingContext2D,
  artwork: FanCardArtwork,
  photos: readonly ImageBitmap[],
  fontFamily: string,
): PhotoSlotRect[] {
  const theme = themeOf(artwork.themeKey)
  const slots: PhotoSlotRect[] = []
  drawFourCutBackground(ctx, theme)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = themeInk(theme, 0.72)
  ctx.font = `600 32px ${fontFamily}`
  ctx.fillText(truncate(ctx, artwork.meetingTitle, CARD_WIDTH - 200), CARD_WIDTH / 2, 112)

  const padding = 70
  const gap = 26
  const slotWidth = CARD_WIDTH - padding * 2
  const slotHeight = Math.round((slotWidth * 9) / 16)
  const stripTop = 168

  for (let index = 0; index < TWO_CUT_SLOTS; index += 1) {
    const y = stripTop + index * (slotHeight + gap)
    const photo = photos[index]
    slots.push({ index, x: padding, y, width: slotWidth, height: slotHeight })
    if (photo) {
      drawPhotoCover(
        ctx, photo, padding, y, slotWidth, slotHeight, 18, artwork.photoAdjustments?.[index],
      )
    } else {
      drawEmptySlot(ctx, padding, y, slotWidth, slotHeight, 18, theme)
    }
  }

  const stripBottom = stripTop + TWO_CUT_SLOTS * slotHeight + gap
  const quoteText = cardQuoteText(artwork)
  if (quoteText) {
    const quote = fitQuote(
      ctx, `“${quoteText}”`, fontFamily, CARD_WIDTH - 200, 150, [48, 42, 37, 32, 28],
      artwork.quoteScale,
    )
    ctx.fillStyle = themeInk(theme, 1)
    ctx.font = `700 ${quote.fontSize}px ${fontFamily}`
    drawQuoteLines(ctx, quote.lines, quote.fontSize, stripBottom + 76)
  }

  ctx.fillStyle = themeInk(theme, 0.88)
  ctx.font = `700 32px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, artwork.influencerName, CARD_WIDTH - 200),
    CARD_WIDTH / 2,
    CARD_HEIGHT - 116,
  )
  ctx.fillStyle = themeInk(theme, 0.6)
  ctx.font = `500 26px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, `${artwork.fanNickname} · ${artwork.dateLabel}`, CARD_WIDTH - 200),
    CARD_WIDTH / 2,
    CARD_HEIGHT - 74,
  )
  drawFooterMark(ctx, fontFamily, CARD_HEIGHT - 40, themeInk(theme, 0.42))

  return slots
}

/**
 * 사진 한 장을 하트로 오려 담는 카드를 그린다.
 *
 * <p>사각형 칸만 있던 배치에서 벗어나는 도안이다. 같은 사진이라도 모양이 달라지면 다른 카드처럼
 * 보인다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param artwork 카드에 담을 정보
 * @param photos 담을 사진 목록이며 첫 장만 쓴다
 * @param fontFamily 사용할 폰트 패밀리
 * @returns 사진이 놓인 칸 목록
 */
function drawHeartCard(
  ctx: CanvasRenderingContext2D,
  artwork: FanCardArtwork,
  photos: readonly ImageBitmap[],
  fontFamily: string,
): PhotoSlotRect[] {
  const theme = themeOf(artwork.themeKey)
  const slots: PhotoSlotRect[] = []
  drawFourCutBackground(ctx, theme)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = themeInk(theme, 0.72)
  ctx.font = `600 32px ${fontFamily}`
  ctx.fillText(truncate(ctx, artwork.meetingTitle, CARD_WIDTH - 200), CARD_WIDTH / 2, 132)

  const size = 720
  const x = (CARD_WIDTH - size) / 2
  const y = 190
  const photo = photos[0]
  slots.push({ index: 0, x, y, width: size, height: size })

  // 하트 뒤에 옅은 그림자를 두어 배경에서 떠 보이게 한다.
  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
  ctx.shadowBlur = 30
  ctx.shadowOffsetY = 10
  heartPath(ctx, x, y, size, size)
  ctx.fillStyle = themeInk(theme, 0.14)
  ctx.fill()
  ctx.restore()

  if (photo) {
    drawPhotoInShape(
      ctx, photo, x, y, size, size,
      () => heartPath(ctx, x, y, size, size),
      artwork.photoAdjustments?.[0],
    )
  }

  // 하트 테두리 — 오린 자리를 또렷하게 만든다.
  heartPath(ctx, x, y, size, size)
  ctx.strokeStyle = themeInk(theme, 0.5)
  ctx.lineWidth = 5
  ctx.stroke()

  const quoteText = cardQuoteText(artwork)
  if (quoteText) {
    const quote = fitQuote(
      ctx, quoteText, fontFamily, CARD_WIDTH - 220, 130, [44, 39, 34, 30, 26], artwork.quoteScale,
    )
    ctx.fillStyle = themeInk(theme, 1)
    ctx.font = `700 ${quote.fontSize}px ${fontFamily}`
    drawQuoteLines(ctx, quote.lines, quote.fontSize, y + size + 96)
  }

  ctx.fillStyle = themeInk(theme, 0.88)
  ctx.font = `700 32px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, artwork.influencerName, CARD_WIDTH - 200), CARD_WIDTH / 2, CARD_HEIGHT - 116,
  )
  ctx.fillStyle = themeInk(theme, 0.6)
  ctx.font = `500 26px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, `${artwork.fanNickname} · ${artwork.dateLabel}`, CARD_WIDTH - 200),
    CARD_WIDTH / 2,
    CARD_HEIGHT - 74,
  )
  drawFooterMark(ctx, fontFamily, CARD_HEIGHT - 40, themeInk(theme, 0.42))

  return slots
}

/**
 * 사진 세 장을 동그랗게 오려 세로로 잇는 카드를 그린다.
 *
 * <p>스티커를 붙여 놓은 듯한 도안이다. 원은 사각형보다 얼굴 주변만 남으므로 표정이 도드라진다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param artwork 카드에 담을 정보
 * @param photos 담을 사진 목록
 * @param fontFamily 사용할 폰트 패밀리
 * @returns 사진이 놓인 칸 목록
 */
function drawCircleCard(
  ctx: CanvasRenderingContext2D,
  artwork: FanCardArtwork,
  photos: readonly ImageBitmap[],
  fontFamily: string,
): PhotoSlotRect[] {
  const theme = themeOf(artwork.themeKey)
  const slots: PhotoSlotRect[] = []
  drawFourCutBackground(ctx, theme)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = themeInk(theme, 0.72)
  ctx.font = `600 30px ${fontFamily}`
  ctx.fillText(truncate(ctx, artwork.meetingTitle, CARD_WIDTH - 200), CARD_WIDTH / 2, 116)

  const size = 300
  const gap = 26
  const startY = 168
  // 가운데를 살짝 비껴 놓아 일부러 붙인 스티커처럼 보이게 한다.
  const offsets = [-70, 60, -40]

  for (let index = 0; index < CIRCLE_SLOTS; index += 1) {
    const x = (CARD_WIDTH - size) / 2 + (offsets[index] ?? 0)
    const y = startY + index * (size + gap)
    const photo = photos[index]
    slots.push({ index, x, y, width: size, height: size })

    const circle = () => {
      ctx.beginPath()
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
      ctx.closePath()
    }

    if (photo) {
      drawPhotoInShape(ctx, photo, x, y, size, size, circle, artwork.photoAdjustments?.[index])
    } else {
      circle()
      ctx.fillStyle = themeInk(theme, 0.06)
      ctx.fill()
    }
    circle()
    ctx.strokeStyle = themeInk(theme, 0.55)
    ctx.lineWidth = 6
    ctx.stroke()
  }

  const stripBottom = startY + CIRCLE_SLOTS * size + (CIRCLE_SLOTS - 1) * gap
  const quoteText = cardQuoteText(artwork)
  if (quoteText) {
    const quote = fitQuote(
      ctx, quoteText, fontFamily, CARD_WIDTH - 240, 96, [36, 32, 28, 25, 22], artwork.quoteScale,
    )
    ctx.fillStyle = themeInk(theme, 1)
    ctx.font = `700 ${quote.fontSize}px ${fontFamily}`
    drawQuoteLines(ctx, quote.lines, quote.fontSize, stripBottom + 58)
  }

  ctx.fillStyle = themeInk(theme, 0.86)
  ctx.font = `700 28px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, `${artwork.influencerName} · ${artwork.fanNickname}`, CARD_WIDTH - 200),
    CARD_WIDTH / 2,
    CARD_HEIGHT - 96,
  )
  ctx.fillStyle = themeInk(theme, 0.58)
  ctx.font = `500 24px ${fontFamily}`
  ctx.fillText(artwork.dateLabel, CARD_WIDTH / 2, CARD_HEIGHT - 62)
  drawFooterMark(ctx, fontFamily, CARD_HEIGHT - 32, themeInk(theme, 0.42))

  return slots
}

/**
 * 사진 세 장을 비스듬히 겹쳐 붙인 카드를 그린다.
 *
 * <p>책상에 사진을 흩어 놓은 듯한 도안이다. 각 장에 흰 여백과 그림자를 둘러 인화한 사진처럼
 * 보이게 한다.
 *
 * @param ctx 그릴 대상 컨텍스트
 * @param artwork 카드에 담을 정보
 * @param photos 담을 사진 목록
 * @param fontFamily 사용할 폰트 패밀리
 * @returns 사진이 놓인 칸 목록
 */
function drawScatterCard(
  ctx: CanvasRenderingContext2D,
  artwork: FanCardArtwork,
  photos: readonly ImageBitmap[],
  fontFamily: string,
): PhotoSlotRect[] {
  const theme = themeOf(artwork.themeKey)
  const slots: PhotoSlotRect[] = []
  drawFourCutBackground(ctx, theme)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = themeInk(theme, 0.72)
  ctx.font = `600 30px ${fontFamily}`
  ctx.fillText(truncate(ctx, artwork.meetingTitle, CARD_WIDTH - 200), CARD_WIDTH / 2, 108)

  const photoWidth = 620
  const photoHeight = Math.round((photoWidth * 9) / 16)
  const paperInset = 22
  const places = [
    { x: 90, y: 190, rotation: -0.07 },
    { x: 360, y: 520, rotation: 0.05 },
    { x: 120, y: 850, rotation: -0.03 },
  ]

  for (let index = 0; index < SCATTER_SLOTS; index += 1) {
    const place = places[index]
    if (!place) continue
    const photo = photos[index]

    ctx.save()
    ctx.translate(place.x + photoWidth / 2, place.y + photoHeight / 2)
    ctx.rotate(place.rotation)
    ctx.translate(-(photoWidth / 2), -(photoHeight / 2))

    // 인화지 — 흰 여백과 그림자로 실제 사진을 올려 둔 느낌을 만든다.
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.42)'
    ctx.shadowBlur = 26
    ctx.shadowOffsetY = 12
    ctx.fillStyle = '#fdfcf8'
    roundedRectPath(
      ctx, -paperInset, -paperInset,
      photoWidth + paperInset * 2, photoHeight + paperInset * 3, 10,
    )
    ctx.fill()
    ctx.restore()

    if (photo) {
      drawPhotoCover(
        ctx, photo, 0, 0, photoWidth, photoHeight, 4, artwork.photoAdjustments?.[index],
      )
    } else {
      drawEmptySlot(ctx, 0, 0, photoWidth, photoHeight, 4, theme)
    }
    ctx.restore()

    // 끌기 판정은 회전을 무시한 자리로 둔다. 기울기가 작아 체감 차이가 크지 않고, 회전까지
    // 반영하려면 화면 쪽에서도 같은 변환을 되짚어야 해 복잡해진다.
    slots.push({ index, x: place.x, y: place.y, width: photoWidth, height: photoHeight })
  }

  const quoteText = cardQuoteText(artwork)
  if (quoteText) {
    const quote = fitQuote(
      ctx, quoteText, fontFamily, CARD_WIDTH - 240, 84, [34, 30, 27, 24, 21], artwork.quoteScale,
    )
    ctx.fillStyle = themeInk(theme, 1)
    ctx.font = `700 ${quote.fontSize}px ${fontFamily}`
    drawQuoteLines(ctx, quote.lines, quote.fontSize, CARD_HEIGHT - 176)
  }

  ctx.fillStyle = themeInk(theme, 0.86)
  ctx.font = `700 28px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, `${artwork.influencerName} · ${artwork.fanNickname}`, CARD_WIDTH - 200),
    CARD_WIDTH / 2,
    CARD_HEIGHT - 96,
  )
  ctx.fillStyle = themeInk(theme, 0.58)
  ctx.font = `500 24px ${fontFamily}`
  ctx.fillText(artwork.dateLabel, CARD_WIDTH / 2, CARD_HEIGHT - 62)
  drawFooterMark(ctx, fontFamily, CARD_HEIGHT - 32, themeInk(theme, 0.42))

  return slots
}

