import { describe, expect, it } from 'vitest'
import {
  SUBTITLE_HISTORY_SIZE,
  appendSubtitleLine,
  isOwnSubtitle,
  parseSubtitlePayload,
  pickSubtitleSpeaker,
  pickSubtitleText,
  type SubtitleLine,
  type SubtitlePayload,
} from './subtitleChannel'

/** AI 워커가 보내는 payload 형태 그대로 인코딩한다. */
function encode(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value))
}

const NAMES = { influencer: '서은', fan: '민지' }

function payload(overrides: Partial<SubtitlePayload> = {}): SubtitlePayload {
  return {
    subtitleId: '1',
    speakerRole: 'FAN',
    originalText: '안녕하세요',
    originalLang: 'ko',
    translatedText: 'Hello',
    translatedLang: 'en',
    ...overrides,
  }
}

describe('parseSubtitlePayload', () => {
  it('AI 워커가 보내는 snake_case payload를 해석한다', () => {
    const parsed = parseSubtitlePayload(
      encode({
        subtitle_id: 12,
        speaker_role: 'INFLUENCER',
        original_text: '반가워요',
        original_lang: 'ko',
        translated_text: 'Nice to meet you',
        translated_lang: 'en',
      }),
    )

    expect(parsed).toEqual({
      // 숫자로 와도 문자열로 정규화해 갱신 대상 비교가 어긋나지 않게 한다.
      subtitleId: '12',
      speakerRole: 'INFLUENCER',
      originalText: '반가워요',
      originalLang: 'ko',
      translatedText: 'Nice to meet you',
      translatedLang: 'en',
    })
  })

  it('번역이 아직 없는 대사도 받아들인다', () => {
    const parsed = parseSubtitlePayload(
      encode({
        subtitle_id: '3',
        speaker_role: 'FAN',
        original_text: '안녕',
        original_lang: 'ko',
        translated_text: null,
        translated_lang: null,
      }),
    )

    expect(parsed?.translatedText).toBeNull()
    expect(parsed?.originalText).toBe('안녕')
  })

  it('JSON이 아니거나 필수 필드가 없으면 무시한다', () => {
    expect(parseSubtitlePayload(new TextEncoder().encode('not json'))).toBeUndefined()
    // speaker_role이 규격 밖이면 화자를 정할 수 없다.
    expect(
      parseSubtitlePayload(encode({ subtitle_id: '1', speaker_role: 'BOT', original_text: 'x' })),
    ).toBeUndefined()
    // 원문이 없으면 보여 줄 것이 없다.
    expect(
      parseSubtitlePayload(encode({ subtitle_id: '1', speaker_role: 'FAN' })),
    ).toBeUndefined()
  })

  it('subtitle_id가 없으면 화자와 대사로 대체 식별자를 만든다', () => {
    const parsed = parseSubtitlePayload(
      encode({ speaker_role: 'FAN', original_text: '안녕' }),
    )

    expect(parsed?.subtitleId).toBe('FAN:안녕')
  })
})

describe('isOwnSubtitle', () => {
  it('팬이 말한 대사는 팬 계정에게만 자기 발화다', () => {
    expect(isOwnSubtitle('FAN', 'FAN')).toBe(true)
    expect(isOwnSubtitle('FAN', 'INFLUENCER')).toBe(false)
  })

  it('1인 운영 계정도 인플루언서 발화의 주인으로 본다', () => {
    expect(isOwnSubtitle('INFLUENCER', 'INFLUENCER')).toBe(true)
    expect(isOwnSubtitle('INFLUENCER', 'SOLO_INFLUENCER')).toBe(true)
    expect(isOwnSubtitle('INFLUENCER', 'FAN')).toBe(false)
  })
})

describe('pickSubtitleText', () => {
  it('내가 말한 대사는 원문을 보여 준다', () => {
    // 번역문은 상대방 언어로 만들어지므로 내 화면에 내 말이 외국어로 뜨면 안 된다.
    expect(pickSubtitleText(payload({ speakerRole: 'FAN' }), 'FAN')).toBe('안녕하세요')
  })

  it('상대가 말한 대사는 번역문을 보여 준다', () => {
    expect(pickSubtitleText(payload({ speakerRole: 'FAN' }), 'INFLUENCER')).toBe('Hello')
  })

  it('번역이 비어 있으면 원문으로 대체한다', () => {
    expect(
      pickSubtitleText(payload({ speakerRole: 'FAN', translatedText: '   ' }), 'INFLUENCER'),
    ).toBe('안녕하세요')
    expect(
      pickSubtitleText(payload({ speakerRole: 'FAN', translatedText: null }), 'INFLUENCER'),
    ).toBe('안녕하세요')
  })
})

describe('pickSubtitleSpeaker', () => {
  it('내 발화는 나로 표시한다', () => {
    expect(pickSubtitleSpeaker(payload({ speakerRole: 'FAN' }), 'FAN', NAMES)).toBe('나')
  })

  it('상대 발화는 역할에 맞는 이름으로 표시한다', () => {
    expect(pickSubtitleSpeaker(payload({ speakerRole: 'FAN' }), 'INFLUENCER', NAMES)).toBe('민지')
    expect(pickSubtitleSpeaker(payload({ speakerRole: 'INFLUENCER' }), 'FAN', NAMES)).toBe('서은')
  })
})

describe('appendSubtitleLine', () => {
  it('새 발화를 뒤에 붙인다', () => {
    const first = appendSubtitleLine([], payload({ subtitleId: '1' }), 'INFLUENCER', NAMES)
    const second = appendSubtitleLine(
      first,
      payload({ subtitleId: '2', originalText: '두 번째', translatedText: 'second' }),
      'INFLUENCER',
      NAMES,
    )

    expect(second.map((line) => line.text)).toEqual(['Hello', 'second'])
  })

  it('같은 subtitleId는 새로 붙이지 않고 교체한다', () => {
    // 워커가 같은 발화를 다듬어 여러 번 보내므로 줄이 늘어나면 안 된다.
    const first = appendSubtitleLine([], payload({ subtitleId: '1' }), 'INFLUENCER', NAMES)
    const refined = appendSubtitleLine(
      first,
      payload({ subtitleId: '1', translatedText: 'Hello there' }),
      'INFLUENCER',
      NAMES,
    )

    expect(refined).toHaveLength(1)
    expect(refined[0]?.text).toBe('Hello there')
  })

  it('최근 세 줄만 유지한다', () => {
    let lines: SubtitleLine[] = []
    for (let index = 1; index <= 5; index += 1) {
      lines = appendSubtitleLine(
        lines,
        payload({ subtitleId: String(index), translatedText: `line ${index}` }),
        'INFLUENCER',
        NAMES,
      )
    }

    expect(lines).toHaveLength(SUBTITLE_HISTORY_SIZE)
    expect(lines.map((line) => line.text)).toEqual(['line 3', 'line 4', 'line 5'])
  })

  it('빈 문장은 빈 줄을 만들지 않도록 버린다', () => {
    const lines = appendSubtitleLine(
      [],
      payload({ originalText: '   ', translatedText: '   ' }),
      'INFLUENCER',
      NAMES,
    )

    expect(lines).toEqual([])
  })
})
