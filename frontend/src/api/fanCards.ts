import { apiRequest } from './client'
import { unwrapEnvelope } from './envelope'
import { translate } from '../i18n'

/** 백엔드 FanCardSuggestionStatus enum과 같은 값이다. */
export type FanCardSuggestionStatus = 'GENERATING' | 'COMPLETED' | 'UNAVAILABLE'

/**
 * 카드 문구의 최대 글자 수이며 백엔드 `FanCard.MAX_TEXT_LENGTH`와 같은 값이다.
 *
 * 서버가 이 길이를 넘는 문구를 거절한다.
 */
export const FAN_CARD_TEXT_MAX_LENGTH = 200

/**
 * 팬이 직접 써 넣을 때의 글자 수 상한이다.
 *
 * 서버 한도보다 짧게 잡는다. 사진이 들어가는 레이아웃은 문구 자리가 100px 남짓이라 가장 작은
 * 글씨로도 서너 줄이 한계다. 한국어로 서버 한도를 꽉 채우면 그 자리를 넘어 사진 위로 흐른다.
 * 카드에 새기는 한 줄 문구라 이 정도면 넉넉하다.
 */
export const FAN_CARD_TEXT_INPUT_LIMIT = 100

/** 팬이 카드 문구로 고를 수 있는 인플루언서 발화 한 건이다. */
export type InfluencerQuote = {
  subtitleId: number
  /** 인플루언서가 실제로 말한 원문이다. */
  text: string
  /** 팬 언어로 번역된 문장이며 번역이 없으면 null이다. */
  translatedText: string | null
  spokenAt: string
}

/** 팬이 저장한 기념 카드다. */
export type FanCard = {
  fanCardId: number
  callSessionId: number
  text: string
  createdAt: string
}

/** 카드 문구 후보 조회 결과다. */
export type FanCardCandidates = {
  callSessionId: number
  /** AI 추천 문구의 준비 상태이며 GENERATING이면 잠시 뒤 다시 조회한다. */
  suggestionStatus: FanCardSuggestionStatus
  aiSuggestions: string[]
  influencerQuotes: InfluencerQuote[]
  savedCard: FanCard | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readSuggestionStatus(value: unknown): FanCardSuggestionStatus {
  return value === 'COMPLETED' || value === 'UNAVAILABLE' ? value : 'GENERATING'
}

/** 응답의 문구 배열에서 문자열만 남긴다. */
function readTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

function readInfluencerQuotes(value: unknown): InfluencerQuote[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    if (typeof item.subtitleId !== 'number' || typeof item.text !== 'string') return []

    return [{
      subtitleId: item.subtitleId,
      text: item.text,
      translatedText: typeof item.translatedText === 'string' ? item.translatedText : null,
      spokenAt: typeof item.spokenAt === 'string' ? item.spokenAt : '',
    }]
  })
}

function readFanCard(value: unknown): FanCard | null {
  if (!isRecord(value)) return null
  if (typeof value.fanCardId !== 'number' || typeof value.text !== 'string') return null

  return {
    fanCardId: value.fanCardId,
    callSessionId: typeof value.callSessionId === 'number' ? value.callSessionId : 0,
    text: value.text,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
  }
}

/**
 * 통화 기념 카드 문구 후보를 조회한다. (팬 본인 전용)
 *
 * AI 추천이 아직 준비되지 않아도 200으로 응답하며, 그때는 aiSuggestions가 빈 배열이고
 * suggestionStatus가 GENERATING이다. 자막 목록은 상태와 무관하게 바로 쓸 수 있다.
 */
export async function getFanCardCandidates(
  callSessionId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<FanCardCandidates> {
  const response = await apiRequest<unknown>(
    `/api/v1/call-sessions/${encodeURIComponent(String(callSessionId))}/fan-card-candidates`,
    { method: 'GET', authToken, signal },
  )

  const data = unwrapEnvelope<unknown>(response)
  if (!isRecord(data)) {
    throw new TypeError(translate('fanCards.t1'))
  }

  return {
    callSessionId: Number(callSessionId),
    suggestionStatus: readSuggestionStatus(data.suggestionStatus),
    aiSuggestions: readTextList(data.aiSuggestions),
    influencerQuotes: readInfluencerQuotes(data.influencerQuotes),
    savedCard: readFanCard(data.savedCard),
  }
}

/**
 * 팬이 고른 문구를 기념 카드로 저장한다. (팬 본인 전용)
 *
 * 카드는 통화 세션당 한 장이라 다시 저장하면 문구가 교체된다.
 */
export async function saveFanCard(
  callSessionId: string | number,
  text: string,
  authToken: string,
  signal?: AbortSignal,
): Promise<FanCard> {
  const response = await apiRequest<unknown>(
    `/api/v1/call-sessions/${encodeURIComponent(String(callSessionId))}/fan-card`,
    {
      method: 'PUT',
      authToken,
      signal,
      body: JSON.stringify({ text }),
    },
  )

  const saved = readFanCard(unwrapEnvelope<unknown>(response))
  if (!saved) {
    throw new TypeError(translate('fanCards.t2'))
  }
  return saved
}
