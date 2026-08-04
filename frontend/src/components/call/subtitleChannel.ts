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

/** 화면에 유지할 최근 대사 수. 한 줄만 두면 읽을 시간이 없어 흐린 줄로 남겨 둔다. */
export const SUBTITLE_HISTORY_SIZE = 3

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/**
 * 데이터 채널로 받은 바이트열을 자막 payload로 해석한다.
 *
 * 다른 토픽이나 손상된 payload가 화면을 깨뜨리지 않도록 필수 필드를 검증하고,
 * 하나라도 어긋나면 undefined를 돌려준다.
 */
export function parseSubtitlePayload(data: Uint8Array): SubtitlePayload | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(data))
  } catch {
    return undefined
  }

  if (typeof parsed !== 'object' || parsed === null) return undefined
  const record = parsed as Record<string, unknown>

  const speakerRole = record.speaker_role
  if (speakerRole !== 'INFLUENCER' && speakerRole !== 'FAN') return undefined

  const originalText = asString(record.original_text)
  if (originalText === null) return undefined

  // subtitle_id는 숫자로 올 수도 있어 문자열로 정규화한다. 없으면 대사 내용으로 대체한다.
  const rawId = record.subtitle_id
  const subtitleId =
    typeof rawId === 'string' || typeof rawId === 'number'
      ? String(rawId)
      : `${speakerRole}:${originalText}`

  return {
    subtitleId,
    speakerRole,
    originalText,
    originalLang: asString(record.original_lang),
    translatedText: asString(record.translated_text),
    translatedLang: asString(record.translated_lang),
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

/**
 * 보는 사람에게 맞는 자막 문장을 고른다.
 *
 * 번역문은 상대방 언어로 만들어지므로, 내가 말한 대사는 원문을 그대로 보여 준다.
 * 상대가 말한 대사는 번역문을 우선하고 번역이 아직 없으면 원문으로 대체한다.
 */
export function pickSubtitleText(
  payload: SubtitlePayload,
  viewerRole: string | undefined,
): string {
  if (isOwnSubtitle(payload.speakerRole, viewerRole)) return payload.originalText

  const translated = payload.translatedText?.trim()
  return translated ? translated : payload.originalText
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
 */
export function appendSubtitleLine(
  current: readonly SubtitleLine[],
  payload: SubtitlePayload,
  viewerRole: string | undefined,
  names: SubtitleSpeakerNames,
): SubtitleLine[] {
  const text = pickSubtitleText(payload, viewerRole).trim()
  if (!text) return [...current]

  const line: SubtitleLine = {
    subtitleId: payload.subtitleId,
    speaker: pickSubtitleSpeaker(payload, viewerRole, names),
    text,
  }

  const existingIndex = current.findIndex((item) => item.subtitleId === payload.subtitleId)
  if (existingIndex >= 0) {
    const next = [...current]
    next[existingIndex] = line
    return next
  }

  return [...current, line].slice(-SUBTITLE_HISTORY_SIZE)
}

/** 화면에 뿌릴 자막 한 줄이며, 갱신 대상을 찾기 위해 subtitleId를 함께 들고 있는다. */
export type SubtitleLine = CaptionLine & { subtitleId: string }
