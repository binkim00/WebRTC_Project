import { describe, expect, it } from 'vitest'
import {
  SUBTITLE_HISTORY_SIZE,
  appendSubtitleLine,
  isOwnSubtitle,
  parseSubtitlePayload,
  pickSubtitleSpeaker,
  pickSubtitleTexts,
  shouldStartWithCaption,
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
    segmentId: null,
    isFinal: true,
    speakerRole: 'FAN',
    originalText: '안녕하세요',
    originalLang: 'ko',
    translatedText: 'Hello',
    translatedLang: 'en',
    ...overrides,
  }
}

describe('shouldStartWithCaption', () => {
  it('양쪽 언어가 같으면 자막을 꺼진 상태로 시작한다', () => {
    expect(shouldStartWithCaption('ko', 'ko')).toBe(false)
  })

  it('언어 표기가 대소문자·공백만 다르면 같은 언어로 본다', () => {
    expect(shouldStartWithCaption(' KO ', 'ko')).toBe(false)
  })

  it('양쪽 언어가 다르면 자막을 켠 상태로 시작한다', () => {
    expect(shouldStartWithCaption('en', 'ko')).toBe(true)
  })

  it('어느 한쪽 언어라도 알 수 없으면 자막을 켠 상태로 시작한다', () => {
    expect(shouldStartWithCaption(null, 'ko')).toBe(true)
    expect(shouldStartWithCaption('ko', undefined)).toBe(true)
    expect(shouldStartWithCaption('  ', '  ')).toBe(true)
  })
})

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
      // segment_id·is_final이 없는 구버전 payload는 확정 자막 하나로 본다.
      segmentId: null,
      isFinal: true,
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

  it('대소문자·공백이 섞인 speaker_role도 받아들인다', () => {
    // 워커 표기가 흔들려도 그 화자의 자막이 통째로 사라지지 않아야 한다.
    expect(
      parseSubtitlePayload(encode({ speaker_role: ' fan ', original_text: '안녕' }))?.speakerRole,
    ).toBe('FAN')
    expect(
      parseSubtitlePayload(encode({ speaker_role: 'Influencer', original_text: 'hi' }))
        ?.speakerRole,
    ).toBe('INFLUENCER')
  })

  it('camelCase 필드로 와도 해석한다', () => {
    const parsed = parseSubtitlePayload(
      encode({ subtitleId: 7, speakerRole: 'FAN', originalText: '안녕', translatedText: 'Hi' }),
    )

    expect(parsed?.subtitleId).toBe('7')
    expect(parsed?.translatedText).toBe('Hi')
  })

  it('subtitle_id가 없으면 매번 다른 로컬 식별자를 만든다', () => {
    // 같은 사람이 같은 말을 반복해도 뒤 자막이 앞 자막을 덮지 않아야 한다.
    const first = parseSubtitlePayload(encode({ speaker_role: 'FAN', original_text: '네' }))
    const second = parseSubtitlePayload(encode({ speaker_role: 'FAN', original_text: '네' }))

    expect(first?.subtitleId).not.toBe(second?.subtitleId)
  })

  it('segment_id와 is_final을 해석하고, 없으면 확정 자막으로 본다', () => {
    const interim = parseSubtitlePayload(
      encode({
        segment_id: 12,
        is_final: false,
        speaker_role: 'INFLUENCER',
        original_text: '안녕하세요. 반가',
        subtitle_id: null,
      }),
    )
    expect(interim?.segmentId).toBe('12')
    expect(interim?.isFinal).toBe(false)

    // 구버전 워커·한↔한 통화 — 두 필드 없이 final만 온다.
    const legacy = parseSubtitlePayload(encode({ speaker_role: 'FAN', original_text: '네' }))
    expect(legacy?.segmentId).toBeNull()
    expect(legacy?.isFinal).toBe(true)
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

describe('pickSubtitleTexts', () => {
  it('번역문이 있으면 번역문만 보여 준다', () => {
    // 번역문은 시청자의 언어로 온다. 시청자가 읽지 못하는 상대 언어 원문은 띄우지 않는다.
    expect(pickSubtitleTexts(payload({ speakerRole: 'FAN' }))).toEqual({
      text: 'Hello',
    })
  })

  it('번역이 비어 있으면 원문만 남긴다', () => {
    expect(pickSubtitleTexts(payload({ speakerRole: 'FAN', translatedText: '   ' }))).toEqual({
      text: '안녕하세요',
    })
    expect(pickSubtitleTexts(payload({ speakerRole: 'FAN', translatedText: null }))).toEqual({
      text: '안녕하세요',
    })
  })

  it('번역문이 원문과 같으면 같은 문장을 두 번 보여 주지 않는다', () => {
    expect(
      pickSubtitleTexts(payload({ speakerRole: 'FAN', translatedText: '안녕하세요' })),
    ).toEqual({ text: '안녕하세요' })
  })
})

describe('pickSubtitleSpeaker', () => {
  it('payload 역할에 맞는 이름으로 표시한다', () => {
    expect(pickSubtitleSpeaker(payload({ speakerRole: 'FAN' }), NAMES)).toBe('민지')
    expect(pickSubtitleSpeaker(payload({ speakerRole: 'INFLUENCER' }), NAMES)).toBe('서은')
  })
})

describe('appendSubtitleLine', () => {
  it('새 발화가 이전 발화를 대체하고 번역문을 본문으로 담는다', () => {
    const first = appendSubtitleLine([], payload({ subtitleId: '1' }), 'INFLUENCER', NAMES)
    const second = appendSubtitleLine(
      first,
      payload({ subtitleId: '2', originalText: '두 번째', translatedText: 'second' }),
      'INFLUENCER',
      NAMES,
    )

    // 자막은 한 줄만 남는다. 시청자 언어의 번역문이 본문이 된다.
    expect(second).toHaveLength(1)
    expect(second[0]?.text).toBe('second')
  })

  it('내가 말한 대사는 화면에 올리지 않는다', () => {
    // 팬 계정으로 보는 화면에서는 팬(나)의 발화가 자막으로 뜨지 않아야 한다.
    const lines = appendSubtitleLine([], payload({ speakerRole: 'FAN' }), 'FAN', NAMES)
    expect(lines).toEqual([])

    // 1인 운영 계정도 인플루언서 발화의 주인이라 같은 규칙을 따른다.
    expect(
      appendSubtitleLine([], payload({ speakerRole: 'INFLUENCER' }), 'SOLO_INFLUENCER', NAMES),
    ).toEqual([])
  })

  it('상대가 말한 대사는 이전 상대 발화만 대체한다', () => {
    const mine = appendSubtitleLine(
      [],
      payload({
        subtitleId: '1',
        speakerRole: 'INFLUENCER',
        originalText: '내 말',
        translatedText: null,
      }),
      'INFLUENCER',
      NAMES,
    )
    const theirs = appendSubtitleLine(
      mine,
      payload({
        subtitleId: '2',
        speakerRole: 'FAN',
        originalText: '팬 말',
        translatedText: null,
      }),
      'INFLUENCER',
      NAMES,
    )

    expect(theirs).toHaveLength(1)
    expect(theirs[0]?.text).toBe('팬 말')
  })

  it('같은 segment의 부분 자막이 한 줄에서 자라다가 final에서 굳는다', () => {
    // interim 1 — 원문만 먼저 온다.
    let lines = appendSubtitleLine(
      [],
      payload({ segmentId: '12', isFinal: false, originalText: '안녕하', translatedText: null }),
      'INFLUENCER',
      NAMES,
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]?.text).toBe('안녕하')
    expect(lines[0]?.pending).toBe(true)

    // interim 2 — 번역이 따라붙으면 번역문으로 교체된다. 줄은 늘어나지 않는다.
    lines = appendSubtitleLine(
      lines,
      payload({
        segmentId: '12',
        isFinal: false,
        originalText: '안녕하세요. 반가',
        translatedText: 'Hello, nice to',
      }),
      'INFLUENCER',
      NAMES,
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]?.text).toBe('Hello, nice to')
    expect(lines[0]?.pending).toBe(true)

    // final — 같은 줄이 확정된다.
    lines = appendSubtitleLine(
      lines,
      payload({
        segmentId: '12',
        isFinal: true,
        originalText: '안녕하세요. 반가워요',
        translatedText: 'Hello, nice to meet you',
      }),
      'INFLUENCER',
      NAMES,
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]?.text).toBe('Hello, nice to meet you')
    expect(lines[0]?.pending).toBe(false)
  })

  it('final 뒤에 늦게 도착한 interim은 확정된 줄을 되돌리지 않는다', () => {
    // interim은 유실될 수 있는 전송이라 순서가 어긋날 수 있다.
    const finalized = appendSubtitleLine(
      [],
      payload({ segmentId: '3', isFinal: true, translatedText: 'Hello there' }),
      'INFLUENCER',
      NAMES,
    )
    const afterLateInterim = appendSubtitleLine(
      finalized,
      payload({ segmentId: '3', isFinal: false, translatedText: 'Hello th' }),
      'INFLUENCER',
      NAMES,
    )

    expect(afterLateInterim).toHaveLength(1)
    expect(afterLateInterim[0]?.text).toBe('Hello there')
    expect(afterLateInterim[0]?.pending).toBe(false)
  })

  it('다음 문장(segment)이 오면 이전 문장을 밀어낸다', () => {
    const first = appendSubtitleLine(
      [],
      payload({ segmentId: '1', isFinal: true, translatedText: 'first sentence' }),
      'INFLUENCER',
      NAMES,
    )
    const second = appendSubtitleLine(
      first,
      payload({ segmentId: '2', isFinal: false, translatedText: 'second sen' }),
      'INFLUENCER',
      NAMES,
    )

    expect(second).toHaveLength(SUBTITLE_HISTORY_SIZE)
    expect(second.at(-1)?.text).toBe('second sen')
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

  it('최근 SUBTITLE_HISTORY_SIZE개만 유지한다', () => {
    let lines: SubtitleLine[] = []
    for (let index = 1; index <= SUBTITLE_HISTORY_SIZE + 2; index += 1) {
      lines = appendSubtitleLine(
        lines,
        payload({
          subtitleId: String(index),
          originalText: `line ${index}`,
          translatedText: null,
        }),
        'INFLUENCER',
        NAMES,
      )
    }

    expect(lines).toHaveLength(SUBTITLE_HISTORY_SIZE)
    // 가장 최근 발화만 남고 앞의 발화는 밀려난다.
    expect(lines.at(-1)?.text).toBe(`line ${SUBTITLE_HISTORY_SIZE + 2}`)
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
