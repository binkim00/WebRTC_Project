// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearMeetingCreateLocalDraft,
  createInitialMeetingForm,
  hasMeaningfulMeetingDraft,
  nextDraftQuestionKey,
  readMeetingCreateLocalDraft,
  writeMeetingCreateLocalDraft,
  type DraftFormQuestion,
} from './managerMeetingCreateDraft'

const USER_ID = 101

afterEach(() => {
  window.localStorage.clear()
  vi.useRealTimers()
})

describe('팬미팅 생성 로컬 초안', () => {
  it('빈 초기 폼은 저장 대상이 아니지만 입력이나 단계 이동이 있으면 저장 대상으로 본다', () => {
    const form = createInitialMeetingForm(9)

    expect(hasMeaningfulMeetingDraft(form, [], '', 0)).toBe(false)
    expect(hasMeaningfulMeetingDraft({ ...form, title: '여름 팬미팅' }, [], '', 0)).toBe(true)
    expect(hasMeaningfulMeetingDraft(form, [], '', 1)).toBe(true)
    expect(
      hasMeaningfulMeetingDraft(
        { ...form, application: { ...form.application, enabled: false } },
        [],
        '',
        0,
      ),
    ).toBe(true)
  })

  it('저장한 폼·질문·서버 초안 ID를 같은 사용자에게 온전히 복구한다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-03T12:34:56.000Z'))
    const form = { ...createInitialMeetingForm(9), title: '복구할 팬미팅' }
    const questions: DraftFormQuestion[] = [
      {
        key: 3,
        questionId: 77,
        questionText: '가장 좋아하는 곡은?',
        questionType: 'SHORT_TEXT',
        required: true,
      },
    ]

    const savedAt = writeMeetingCreateLocalDraft(USER_ID, {
      step: 2,
      form,
      questions,
      formDescription: '응모 질문입니다.',
      createdMeetingId: 55,
    })

    expect(savedAt).toBe('2026-08-03T12:34:56.000Z')
    expect(readMeetingCreateLocalDraft(USER_ID)).toMatchObject({
      savedAt,
      step: 2,
      form,
      questions,
      formDescription: '응모 질문입니다.',
      createdMeetingId: 55,
    })
    expect(readMeetingCreateLocalDraft(USER_ID + 1)).toBeUndefined()
  })

  it('손상된 초안은 복구하지 않고 해당 사용자 저장소에서 제거한다', () => {
    const storageKey = `melly-manager-meeting-create:${USER_ID}`
    window.localStorage.setItem(storageKey, JSON.stringify({ version: 1, step: 99 }))

    expect(readMeetingCreateLocalDraft(USER_ID)).toBeUndefined()
    expect(window.localStorage.getItem(storageKey)).toBeNull()
  })

  it('복구된 질문의 가장 큰 key 다음 값을 새 질문 key로 사용한다', () => {
    const questions: DraftFormQuestion[] = [
      {
        key: 8,
        questionText: '질문 1',
        questionType: 'SHORT_TEXT',
        required: false,
      },
      {
        key: 2,
        questionText: '질문 2',
        questionType: 'LONG_TEXT',
        required: true,
      },
    ]

    expect(nextDraftQuestionKey(questions)).toBe(9)
    expect(nextDraftQuestionKey([])).toBe(1)
  })

  it('명시적으로 초기화하면 저장된 초안을 다시 복구하지 않는다', () => {
    writeMeetingCreateLocalDraft(USER_ID, {
      step: 0,
      form: { ...createInitialMeetingForm(9), title: '삭제할 초안' },
      questions: [],
      formDescription: '',
    })

    expect(clearMeetingCreateLocalDraft(USER_ID)).toBe(true)
    expect(readMeetingCreateLocalDraft(USER_ID)).toBeUndefined()
  })
})
