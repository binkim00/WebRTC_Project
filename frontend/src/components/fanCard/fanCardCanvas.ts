/**
 * 통화 기념 카드를 Canvas에 그린다.
 *
 * 외부 이미지를 쓰지 않고 그라데이션과 텍스트만 그린다. 배경에 다른 도메인의 이미지를 넣으면
 * canvas가 오염되어 `toBlob()`이 보안 오류로 막히는데, 카드는 저장·다운로드가 핵심이라
 * 처음부터 자체 도안만 사용한다.
 */

import { cardStickerUrl } from './cardStickers'

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

/**
 * 레이아웃에 맞는 카드 크기를 알려 준다.
 *
 * @param layout 그릴 레이아웃이며 undefined면 문구 전용이다
 * @returns 캔버스에 설정할 크기
 */
export function fanCardSizeOf(layout: FanCardLayout | undefined): FanCardSize {
  if (layout === 'FOURCUT_VERTICAL') return FOURCUT_VERTICAL_SIZE
  if (layout === 'FOURCUT_HORIZONTAL') return FOURCUT_HORIZONTAL_SIZE
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
 * 팬이 고를 수 있는 카드 레이아웃이다.
 *
 * <p>INSTA·POLAROID는 사진 한 장, FOURCUT 계열은 네 장을 쓴다. 네컷은 칸 배치가 다른
 * 세 가지(2×2 격자, 세로 스트립, 가로 스트립)를 따로 고를 수 있다.
 */
export type FanCardLayout =
  | 'INSTA'
  | 'POLAROID'
  | 'FOURCUT'
  | 'FOURCUT_VERTICAL'
  | 'FOURCUT_HORIZONTAL'

/** FOURCUT이 채우는 칸 수다. */
const FOUR_CUT_SLOTS = 4

/**
 * 팬이 고를 수 있는 카드 글꼴이다.
 *
 * <p>DEFAULT는 서비스 본문과 같은 글꼴이고 나머지는 index.css의 @font-face로 등록해 둔
 * 것이다. 값을 늘리려면 @font-face 선언과 아래 매핑을 함께 넓혀야 한다.
 */
export type FanCardFont = 'DEFAULT' | 'ROUND' | 'HANDWRITING' | 'HEADLINE'

/** 글꼴 키를 Canvas font 속성에 넣을 패밀리 이름으로 옮긴다. DEFAULT는 페이지 글꼴을 쓴다. */
const FONT_FAMILY_BY_KEY: Record<FanCardFont, string | undefined> = {
  DEFAULT: undefined,
  ROUND: '"Jua"',
  HANDWRITING: '"Gaegu"',
  HEADLINE: '"Do Hyeon"',
}

/** 카드에 담을 정보다. */
export type FanCardArtwork = {
  /** 팬이 고른 문구 */
  text: string
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
  /** 팬이 고른 글꼴이다. 없거나 내려받지 못하면 서비스 기본 글꼴로 그린다. */
  fontKey?: FanCardFont
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
): { fontSize: number; lines: string[] } {
  let fallback = { fontSize: fontSizes.at(-1) ?? 34, lines: [text] }

  for (const fontSize of fontSizes) {
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
 * 기념 카드를 캔버스에 그린다.
 *
 * 웹폰트가 아직 로드되지 않았으면 글자가 대체 글꼴로 그려져 저장된 이미지가 화면과 달라지므로
 * 폰트 준비를 기다린 뒤 그린다.
 *
 * <p>사진을 넘기지 않았거나 레이아웃을 고르지 않았으면 문구 전용 카드를 그린다. 셔터를
 * 누르지 않았거나 촬영에 실패한 팬도 카드를 받을 수 있어야 하기 때문이다.
 *
 * @param canvas 그릴 대상 캔버스
 * @param artwork 카드에 담을 정보
 * @throws Error 2D 컨텍스트를 얻지 못한 경우
 */
export async function drawFanCard(
  canvas: HTMLCanvasElement,
  artwork: FanCardArtwork,
): Promise<void> {
  const photos = artwork.photos ?? []
  // 사진이 없으면 문구 전용으로 그리므로 크기도 기본 카드에 맞춘다.
  const size = fanCardSizeOf(photos.length > 0 ? artwork.layout : undefined)
  canvas.width = size.width
  canvas.height = size.height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('카드를 그릴 수 없습니다. 브라우저가 canvas를 지원하지 않습니다.')
  }

  await document.fonts?.ready
  const fontFamily = await resolveCardFontFamily(artwork.fontKey)

  if (photos.length === 0) {
    drawQuoteOnlyCard(ctx, artwork, fontFamily)
  } else {
    switch (artwork.layout) {
      case 'INSTA':
        drawInstaCard(ctx, artwork, photos, fontFamily)
        break
      case 'POLAROID':
        drawPolaroidCard(ctx, artwork, photos, fontFamily)
        break
      case 'FOURCUT':
        drawFourCutCard(ctx, artwork, photos, fontFamily)
        break
      case 'FOURCUT_VERTICAL':
        drawFourCutVerticalCard(ctx, artwork, photos, fontFamily)
        break
      case 'FOURCUT_HORIZONTAL':
        drawFourCutHorizontalCard(ctx, artwork, photos, fontFamily)
        break
      default:
        drawQuoteOnlyCard(ctx, artwork, fontFamily)
    }
  }

  // 꾸미기 요소는 카드를 다 그린 뒤 맨 위에 얹는다.
  if (artwork.decorations?.length) {
    await drawDecorations(ctx, artwork.decorations, fontFamily)
  }
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
  const contentWidth = CARD_WIDTH - CARD_PADDING * 2

  drawBackground(ctx)

  // 팬미팅 제목
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)'
  ctx.font = `600 34px ${fontFamily}`
  ctx.fillText(truncate(ctx, artwork.meetingTitle, contentWidth), CARD_WIDTH / 2, 168)

  // 문구 — 카드의 주인공이라 남은 공간을 최대한 쓴다.
  const quote = fitQuote(ctx, artwork.text, fontFamily, contentWidth)
  const lineHeight = quote.fontSize * QUOTE_LINE_HEIGHT_RATIO
  const quoteBlockHeight = quote.lines.length * lineHeight
  let quoteY = (CARD_HEIGHT - quoteBlockHeight) / 2 + quote.fontSize * 0.34

  ctx.fillStyle = 'rgba(255, 255, 255, 0.26)'
  ctx.font = `700 132px ${fontFamily}`
  ctx.fillText('“', CARD_WIDTH / 2, quoteY - quote.fontSize * 0.9)

  ctx.fillStyle = '#ffffff'
  ctx.font = `700 ${quote.fontSize}px ${fontFamily}`
  for (const line of quote.lines) {
    ctx.fillText(line, CARD_WIDTH / 2, quoteY)
    quoteY += lineHeight
  }

  // 하단 정보
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
  ctx.font = `700 42px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, artwork.influencerName, contentWidth),
    CARD_WIDTH / 2,
    CARD_HEIGHT - 232,
  )

  ctx.fillStyle = 'rgba(255, 255, 255, 0.66)'
  ctx.font = `500 30px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, `${artwork.fanNickname} 님과의 팬미팅`, contentWidth),
    CARD_WIDTH / 2,
    CARD_HEIGHT - 178,
  )
  ctx.fillText(artwork.dateLabel, CARD_WIDTH / 2, CARD_HEIGHT - 130)

  drawFooterMark(ctx, fontFamily)
}

/** 카드 배경과 장식을 그린다. */
function drawBackground(ctx: CanvasRenderingContext2D): void {
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT)
  gradient.addColorStop(0, '#3b1d63')
  gradient.addColorStop(0.55, '#5b2a86')
  gradient.addColorStop(1, '#8e3b74')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

  // 은은한 빛 번짐으로 단색 배경 느낌을 줄인다.
  const glow = ctx.createRadialGradient(
    CARD_WIDTH / 2, CARD_HEIGHT * 0.32, 40,
    CARD_WIDTH / 2, CARD_HEIGHT * 0.32, CARD_WIDTH * 0.72,
  )
  glow.addColorStop(0, 'rgba(255, 255, 255, 0.18)')
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

  // 카드 테두리
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
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
 * 사진을 지정한 사각형에 비율을 유지한 채 가득 채워 그린다.
 *
 * <p>가로세로 비가 맞지 않으면 넘치는 쪽을 중앙 기준으로 잘라 낸다. 늘려 맞추면 얼굴이
 * 찌그러지므로 크롭을 택한다.
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
): void {
  ctx.save()
  if (radius > 0) {
    roundedRectPath(ctx, x, y, width, height, radius)
  } else {
    ctx.beginPath()
    ctx.rect(x, y, width, height)
  }
  ctx.clip()

  const scale = Math.max(width / photo.width, height / photo.height)
  const drawWidth = photo.width * scale
  const drawHeight = photo.height * scale
  ctx.drawImage(
    photo,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
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
): void {
  roundedRectPath(ctx, x, y, width, height, radius)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)'
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
): void {
  // 파스텔 배경
  const background = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT)
  background.addColorStop(0, '#ffe3f1')
  background.addColorStop(0.5, '#efe0ff')
  background.addColorStop(1, '#dde7ff')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

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
  ctx.fillStyle = '#ffffff'
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

  ctx.fillStyle = '#ffffff'
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
  if (photo) {
    drawPhotoCover(ctx, photo, frameX, photoTop, frameWidth, photoHeight)
  } else {
    drawEmptySlot(ctx, frameX, photoTop, frameWidth, photoHeight, 0)
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

  // 캡션 — 계정명에 이어 문구를 쓰는 게시물 형식이다.
  const captionTop = actionTop + actionHeight
  const captionHeight = 118
  const captionWidth = frameWidth - inset * 2
  const quote = fitQuote(
    ctx, artwork.text, fontFamily, captionWidth, 78, [30, 27, 24, 22, 20],
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
): void {
  // 어두운 배경이라야 흰 폴라로이드가 떠 보인다.
  const background = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT)
  background.addColorStop(0, '#2a1547')
  background.addColorStop(0.6, '#3b1d63')
  background.addColorStop(1, '#57265f')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

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
  if (photo) {
    drawPhotoCover(
      ctx, photo, frameX + photoInset, frameY + photoInset, photoSize, photoSize,
    )
  } else {
    drawEmptySlot(
      ctx, frameX + photoInset, frameY + photoInset, photoSize, photoSize, 0,
    )
  }

  // 아래 여백 — 문구를 손글씨처럼 기울여 사인 느낌을 준다.
  const captionTop = frameY + photoInset + photoSize
  const captionWidth = photoSize
  const quote = fitQuote(
    ctx, artwork.text, fontFamily, captionWidth, 130, [46, 40, 35, 30, 26],
  )

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
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

  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
  ctx.font = `500 24px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, artwork.meetingTitle, CARD_WIDTH - 160),
    CARD_WIDTH / 2,
    frameY + frameHeight + 62,
  )

  drawFooterMark(ctx, fontFamily, CARD_HEIGHT - 34)
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
): void {
  drawFourCutBackground(ctx)

  // 상단 제목
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)'
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

    if (photo) {
      drawPhotoCover(ctx, photo, x, y, slotSize, slotSize, 16)
    } else {
      drawEmptySlot(ctx, x, y, slotSize, slotSize, 16)
    }
  }

  // 문구
  const gridBottom = gridY + slotSize * 2 + gap
  const quote = fitQuote(
    ctx, `“${artwork.text}”`, fontFamily, CARD_WIDTH - 200, 110, [40, 35, 31, 27, 24],
  )
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 ${quote.fontSize}px ${fontFamily}`
  drawQuoteLines(ctx, quote.lines, quote.fontSize, gridBottom + 62)

  // 하단 정보
  ctx.fillStyle = 'rgba(255, 255, 255, 0.88)'
  ctx.font = `700 32px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, artwork.influencerName, CARD_WIDTH - 200),
    CARD_WIDTH / 2,
    CARD_HEIGHT - 116,
  )

  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
  ctx.font = `500 26px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, `${artwork.fanNickname} · ${artwork.dateLabel}`, CARD_WIDTH - 200),
    CARD_WIDTH / 2,
    CARD_HEIGHT - 74,
  )

  drawFooterMark(ctx, fontFamily, CARD_HEIGHT - 40)
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
  width: number = CARD_WIDTH,
  height: number = CARD_HEIGHT,
  inset = 30,
): void {
  const background = ctx.createLinearGradient(0, 0, width, height)
  background.addColorStop(0, '#1b1030')
  background.addColorStop(0.55, '#3b1d63')
  background.addColorStop(1, '#6d2d6b')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)'
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
): void {
  const { width, height } = FOURCUT_VERTICAL_SIZE
  const centerX = width / 2
  const padding = 24
  const contentWidth = width - padding * 2

  drawFourCutBackground(ctx, width, height, 14)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  // 상단 — 제목과 문구만 둔다.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
  ctx.font = `600 24px ${fontFamily}`
  ctx.fillText(truncate(ctx, artwork.meetingTitle, contentWidth), centerX, 58)

  const quote = fitQuote(
    ctx, `“${artwork.text}”`, fontFamily, contentWidth, 96, [30, 27, 24, 21, 19],
  )
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 ${quote.fontSize}px ${fontFamily}`
  drawQuoteLines(ctx, quote.lines, quote.fontSize, 104, centerX)

  // 세로 스트립 — 칸이 카드 폭을 꽉 채워 좌우에 빈 공간이 없다.
  const gap = 10
  const slotWidth = contentWidth
  const slotHeight = Math.round((slotWidth * 9) / 16)
  const stripTop = 200

  for (let index = 0; index < FOUR_CUT_SLOTS; index += 1) {
    const y = stripTop + index * (slotHeight + gap)
    const photo = photos[index]
    if (photo) {
      drawPhotoCover(ctx, photo, padding, y, slotWidth, slotHeight, 10)
    } else {
      drawEmptySlot(ctx, padding, y, slotWidth, slotHeight, 10)
    }
  }

  // 하단 서명 — 스트립 바로 아래에 붙인다.
  const stripBottom = stripTop + FOUR_CUT_SLOTS * slotHeight + (FOUR_CUT_SLOTS - 1) * gap

  ctx.fillStyle = 'rgba(255, 255, 255, 0.88)'
  ctx.font = `700 28px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, artwork.influencerName, contentWidth), centerX, stripBottom + 48,
  )

  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
  ctx.font = `500 22px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, `${artwork.fanNickname} · ${artwork.dateLabel}`, contentWidth),
    centerX,
    stripBottom + 84,
  )

  drawFooterMark(ctx, fontFamily, stripBottom + 122, 'rgba(255, 255, 255, 0.42)', centerX)
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
): void {
  const { width, height } = FOURCUT_HORIZONTAL_SIZE
  const centerX = width / 2
  const padding = 24
  const contentWidth = width - padding * 2

  drawFourCutBackground(ctx, width, height, 14)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  // 상단 — 제목과 문구만 둔다.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
  ctx.font = `600 24px ${fontFamily}`
  ctx.fillText(truncate(ctx, artwork.meetingTitle, contentWidth), centerX, 56)

  const quote = fitQuote(
    ctx, `“${artwork.text}”`, fontFamily, contentWidth, 96, [34, 30, 27, 24, 21],
  )
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 ${quote.fontSize}px ${fontFamily}`
  drawQuoteLines(ctx, quote.lines, quote.fontSize, 102, centerX)

  // 가로 스트립 — 칸이 카드 폭을 꽉 채워 좌우에 빈 공간이 없다.
  const gap = 12
  const slotWidth = (contentWidth - gap * (FOUR_CUT_SLOTS - 1)) / FOUR_CUT_SLOTS
  const slotHeight = Math.round((slotWidth * 16) / 9)
  const stripTop = 196

  for (let index = 0; index < FOUR_CUT_SLOTS; index += 1) {
    const x = padding + index * (slotWidth + gap)
    const photo = photos[index]
    if (photo) {
      drawPhotoCover(ctx, photo, x, stripTop, slotWidth, slotHeight, 10)
    } else {
      drawEmptySlot(ctx, x, stripTop, slotWidth, slotHeight, 10)
    }
  }

  // 하단 서명 — 스트립 바로 아래에 붙인다.
  const stripBottom = stripTop + slotHeight

  ctx.fillStyle = 'rgba(255, 255, 255, 0.88)'
  ctx.font = `700 28px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, artwork.influencerName, contentWidth), centerX, stripBottom + 48,
  )

  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
  ctx.font = `500 22px ${fontFamily}`
  ctx.fillText(
    truncate(ctx, `${artwork.fanNickname} · ${artwork.dateLabel}`, contentWidth),
    centerX,
    stripBottom + 84,
  )

  drawFooterMark(ctx, fontFamily, stripBottom + 122, 'rgba(255, 255, 255, 0.42)', centerX)
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
      () => reject(new Error('스티커 그림을 불러오지 못했습니다.')),
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
