/**
 * 통화 기념 카드를 Canvas에 그린다.
 *
 * 외부 이미지를 쓰지 않고 그라데이션과 텍스트만 그린다. 배경에 다른 도메인의 이미지를 넣으면
 * canvas가 오염되어 `toBlob()`이 보안 오류로 막히는데, 카드는 저장·다운로드가 핵심이라
 * 처음부터 자체 도안만 사용한다.
 */

/** 카드 이미지 크기이며 세로형 포토카드 비율(4:5)이다. */
export const CARD_WIDTH = 1080
export const CARD_HEIGHT = 1350

/** 카드 좌우 여백이다. */
const CARD_PADDING = 96

/** 문구에 사용할 폰트 크기 후보이며 큰 값부터 시도해 카드에 들어가는 첫 크기를 쓴다. */
const QUOTE_FONT_SIZES = [76, 68, 60, 52, 46, 40, 34]

/** 문구 영역에 허용하는 최대 높이다. 제목과 하단 정보 자리를 남겨 둔다. */
const QUOTE_AREA_HEIGHT = 680

/** 문구 줄 간격 배수다. */
const QUOTE_LINE_HEIGHT_RATIO = 1.45

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
 * @returns 선택한 폰트 크기와 줄 목록
 */
function fitQuote(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontFamily: string,
  maxWidth: number,
): { fontSize: number; lines: string[] } {
  let fallback = { fontSize: QUOTE_FONT_SIZES.at(-1) ?? 34, lines: [text] }

  for (const fontSize of QUOTE_FONT_SIZES) {
    ctx.font = `700 ${fontSize}px ${fontFamily}`
    const lines = wrapText(ctx, text, maxWidth)
    const height = lines.length * fontSize * QUOTE_LINE_HEIGHT_RATIO
    if (height <= QUOTE_AREA_HEIGHT) {
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
 * 기념 카드를 캔버스에 그린다.
 *
 * 웹폰트가 아직 로드되지 않았으면 글자가 대체 글꼴로 그려져 저장된 이미지가 화면과 달라지므로
 * 폰트 준비를 기다린 뒤 그린다.
 *
 * @param canvas 그릴 대상 캔버스
 * @param artwork 카드에 담을 정보
 * @throws Error 2D 컨텍스트를 얻지 못한 경우
 */
export async function drawFanCard(
  canvas: HTMLCanvasElement,
  artwork: FanCardArtwork,
): Promise<void> {
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('카드를 그릴 수 없습니다. 브라우저가 canvas를 지원하지 않습니다.')
  }

  await document.fonts?.ready
  const fontFamily = resolveFontFamily()
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

/** 카드 하단에 서비스 표시를 남긴다. */
function drawFooterMark(ctx: CanvasRenderingContext2D, fontFamily: string): void {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.42)'
  ctx.font = `600 26px ${fontFamily}`
  ctx.fillText('MELLY', CARD_WIDTH / 2, CARD_HEIGHT - 74)
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
