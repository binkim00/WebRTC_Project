import type { CaptionLine } from './CallStage'

/**
 * 자막 AI가 대사를 보내는 LiveKit **데이터 채널 토픽**이다.
 *
 * 자막은 LiveKit 기본 transcription API(`lk.transcription` 텍스트 스트림)로 오지 않는다.
 * AI 워커(`ai/pipeline/processor.py`)가 `publish_data(payload, reliable=True, topic="subtitle")`로
 * 직접 만든 JSON을 보낸다. 그래서 `useTranscriptions()`로는 영원히 아무것도 받지 못하고,
 * 이 토픽을 구독해야 한다. 워커가 나중에 기본 transcription API로 옮기면 이 모듈을 지우고
 * `useTranscriptions()`로 되돌리면 된다.
 */
export const SUBTITLE_DATA_TOPIC = 'subtitle'

/** 자막 payload를 만든 화자의 역할이며 AI 워커가 이 두 값만 보낸다. */
export type SubtitleSpeakerRole = 'INFLUENCER' | 'FAN'

/**
 * AI 워커가 데이터 채널로 보내는 자막 한 건이다.
 *
 * `ai/pipeline/processor.py`가 직렬화하는 필드와 1:1로 맞춘다.
 */
export type SubtitlePayload = {
  subtitleId: string
  speakerRole: SubtitleSpeakerRole
  originalText: string
  originalLang: string | null
  translatedText: string | null
  translatedLang: string | null
}

/**
 * 화면에 유지할 최근 대사 수.
 *
 * 3줄이던 것을 늘렸다. 짧은 대답이 자주 오가는 통화에서 방금 지나간 대사가 곧바로 밀려나
 * "자막이 누락됐다"고 보이는 경우가 있었다.
 */
export const SUBTITLE_HISTORY_SIZE = 6

/** subtitle_id 없이 온 자막에 붙일 로컬 식별자 번호다. */
let fallbackSubtitleSeq = 0

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/**
 * 화자 역할 값을 관대하게 해석한다.
 *
 * 이전에는 `'INFLUENCER'`/`'FAN'` 완전 일치만 통과시켜서, 워커가 소문자나 공백이 섞인 값을
 * 보내면 그 화자의 자막이 **전부 조용히 버려졌다.** 화자별로 자막이 다르게 누락되는 증상의
 * 원인이 될 수 있어 대소문자·공백을 정규화한다. (그래도 규격 밖 값이면 화자를 정할 수 없다.)
 */
function normalizeSpeakerRole(value: unknown): SubtitleSpeakerRole | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toUpperCase()
  if (normalized === 'INFLUENCER' || normalized === 'FAN') return normalized
  return undefined
}

/**
 * 데이터 채널로 받은 바이트열을 자막 payload로 해석한다.
 *
 * 다른 토픽이나 손상된 payload가 화면을 깨뜨리지 않도록 필수 필드를 검증하고,
 * 하나라도 어긋나면 undefined를 돌려준다.
 *
 * 버려진 payload는 개발 모드에서 콘솔에 남긴다. "자막이 오지 않은 것"과 "와서 버려진 것"을
 * 구분할 수 없으면 프론트 문제인지 AI·백엔드 파이프라인 문제인지 가릴 수 없기 때문이다.
 */
export function parseSubtitlePayload(data: Uint8Array): SubtitlePayload | undefined {
  const raw = new TextDecoder().decode(data)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    if (import.meta.env.DEV) console.warn('[subtitle] JSON이 아닌 payload를 버렸습니다:', raw)
    return undefined
  }

  if (typeof parsed !== 'object' || parsed === null) {
    if (import.meta.env.DEV) console.warn('[subtitle] 객체가 아닌 payload를 버렸습니다:', parsed)
    return undefined
  }
  const record = parsed as Record<string, unknown>

  // 워커가 snake_case로 보내지만, camelCase로 바뀌어도 자막이 사라지지 않도록 둘 다 읽는다.
  const speakerRole = normalizeSpeakerRole(record.speaker_role ?? record.speakerRole)
  if (!speakerRole) {
    if (import.meta.env.DEV) {
      console.warn('[subtitle] speaker_role을 해석할 수 없어 버렸습니다:', record)
    }
    return undefined
  }

  const originalText = asString(record.original_text ?? record.originalText)
  if (originalText === null) {
    if (import.meta.env.DEV) {
      console.warn('[subtitle] original_text가 없어 버렸습니다:', record)
    }
    return undefined
  }

  // subtitle_id는 숫자로 올 수도 있어 문자열로 정규화한다.
  //
  // 없을 때는 **매번 새로운 로컬 식별자**를 만든다. 이전에는 `역할:원문`을 대체 식별자로 썼는데,
  // 같은 사람이 같은 말("네", "응")을 반복하면 아래 appendSubtitleLine이 기존 줄을 교체해
  // 새 자막이 화면에 나타나지 않았다. 중복 제거는 서버가 준 subtitle_id가 있을 때만 한다.
  const rawId = record.subtitle_id ?? record.subtitleId
  const subtitleId =
    typeof rawId === 'string' || typeof rawId === 'number'
      ? String(rawId)
      : `local-${(fallbackSubtitleSeq += 1)}`

  return {
    subtitleId,
    speakerRole,
    originalText,
    originalLang: asString(record.original_lang ?? record.originalLang),
    translatedText: asString(record.translated_text ?? record.translatedText),
    translatedLang: asString(record.translated_lang ?? record.translatedLang),
  }
}

/** 로그인 역할이 자막 payload의 화자와 같은 사람인지 판단한다. */
export function isOwnSubtitle(
  speakerRole: SubtitleSpeakerRole,
  viewerRole: string | undefined,
): boolean {
  if (speakerRole === 'FAN') return viewerRole === 'FAN'
  // 1인 운영 계정도 인플루언서로서 통화에 참여한다.
  return viewerRole === 'INFLUENCER' || viewerRole === 'SOLO_INFLUENCER'
}

/** 한 자막에서 화면에 뿌릴 원문과 번역문이다. */
export type SubtitleTexts = {
  /** 화자가 실제로 말한 원문이며 항상 표시한다. */
  text: string
  /** 번역문이 따로 있을 때만 채워지는 보조 줄이다. */
  translatedText?: string
}

/**
 * 보는 사람에게 맞는 자막 문장을 고른다.
 *
 * **원문은 항상 표시하고**, 번역문은 있을 때만 아래에 덧붙인다. 이전에는 상대 발화에서
 * 번역문이 원문을 대체해, 번역이 어긋났을 때 사용자가 원문을 확인할 방법이 없었다.
 *
 * 내가 말한 대사의 번역문은 상대방 언어로 만들어진 것이라 내 화면에서는 의미가 없으므로 뺀다.
 * 번역문이 원문과 같으면(같은 언어) 같은 문장을 두 줄로 반복하지 않는다.
 */
export function pickSubtitleTexts(
  payload: SubtitlePayload,
  viewerRole: string | undefined,
): SubtitleTexts {
  const text = payload.originalText.trim()
  if (isOwnSubtitle(payload.speakerRole, viewerRole)) return { text }

  const translated = payload.translatedText?.trim()
  if (!translated || translated === text) return { text }
  return { text, translatedText: translated }
}

export type SubtitleSpeakerNames = {
  /** 인플루언서 표시 이름 */
  influencer: string
  /** 팬 표시 이름 */
  fan: string
}

/** 자막 앞에 붙일 화자 이름을 만든다. 내가 말한 대사는 '나'로 표시한다. */
export function pickSubtitleSpeaker(
  payload: SubtitlePayload,
  viewerRole: string | undefined,
  names: SubtitleSpeakerNames,
): string {
  if (isOwnSubtitle(payload.speakerRole, viewerRole)) return '나'
  return payload.speakerRole === 'INFLUENCER' ? names.influencer : names.fan
}

/**
 * 받은 자막을 최근 대사 목록에 반영한다.
 *
 * 새 발화는 뒤에 붙이고 최근 {@link SUBTITLE_HISTORY_SIZE}개만 남긴다.
 * 빈 문장은 화면에 빈 줄을 만들 뿐이라 버린다.
 *
 * `subtitleId`가 같으면 붙이지 않고 **교체**한다. 워커는 확정된 발화마다 DB INSERT의
 * 채번 결과를 id로 쓰므로 같은 id를 다시 보내지는 않지만, reliable 채널 재전송처럼
 * 같은 payload가 두 번 도착해도 같은 줄이 겹쳐 보이지 않게 하는 방어 장치다.
 * (id 없이 온 자막은 parseSubtitlePayload가 매번 다른 로컬 id를 주므로 교체되지 않는다.)
 *
 * 화자 이름은 **받은 시점에 계산해 문자열로 저장**한다. 참가자가 나가서 이름을 알 수 없게 되어도
 * 이미 지나간 자막의 이름이 바뀌지 않게 하려는 것이다.
 */
export function appendSubtitleLine(
  current: readonly SubtitleLine[],
  payload: SubtitlePayload,
  viewerRole: string | undefined,
  names: SubtitleSpeakerNames,
): SubtitleLine[] {
  const texts = pickSubtitleTexts(payload, viewerRole)
  if (!texts.text) return [...current]

  const line: SubtitleLine = {
    id: payload.subtitleId,
    speaker: pickSubtitleSpeaker(payload, viewerRole, names),
    ...texts,
  }

  const existingIndex = current.findIndex((item) => item.id === payload.subtitleId)
  if (existingIndex >= 0) {
    const next = [...current]
    next[existingIndex] = line
    return next
  }

  return [...current, line].slice(-SUBTITLE_HISTORY_SIZE)
}

/**
 * 화면에 뿌릴 자막 한 줄이다.
 *
 * `id`는 워커가 준 subtitle_id(없으면 로컬 채번값)이며, 갱신 대상 찾기와 React key에 함께 쓴다.
 */
export type SubtitleLine = CaptionLine & { id: string }
