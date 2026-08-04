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

describe('팬미팅 생성 브라우저 초안', () => {
  it('빈 초기 폼과 단계 이동만으로는 초안을 만들지 않고 실제 입력은 저장 대상으로 본다', () => {
    const form = createInitialMeetingForm(9)

    expect(hasMeaningfulMeetingDraft(form, [], '', 0)).toBe(false)
    expect(hasMeaningfulMeetingDraft(form, [], '', 3)).toBe(false)
    expect(hasMeaningfulMeetingDraft({ ...form, title: '여름 팬미팅' }, [], '', 0)).toBe(true)
  })

  it('폼과 질문을 같은 사용자의 브라우저에서 복구한다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-04T05:30:00.000Z'))
    const form = { ...createInitialMeetingForm(9), title: '복구할 팬미팅' }
    const questions: DraftFormQuestion[] = [{
      key: 3,
      questionText: '가장 좋아하는 곡은?',
      questionType: 'SHORT_TEXT',
      required: true,
    }]

    const savedAt = writeMeetingCreateLocalDraft(USER_ID, {
      step: 4,
      form,
      questions,
      formDescription: '응모 질문입니다.',
    })

    expect(savedAt).toBe('2026-08-04T05:30:00.000Z')
    expect(readMeetingCreateLocalDraft(USER_ID)).toMatchObject({
      savedAt,
      step: 4,
      form,
      questions,
      formDescription: '응모 질문입니다.',
    })
    expect(readMeetingCreateLocalDraft(USER_ID + 1)).toBeUndefined()
  })

  it('손상된 초안은 제거하고 명시적 초기화 뒤에는 복구하지 않는다', () => {
    const key = `melly-manager-meeting-create:${USER_ID}`
    window.localStorage.setItem(key, JSON.stringify({ version: 1, step: 99 }))
    expect(readMeetingCreateLocalDraft(USER_ID)).toBeUndefined()
    expect(window.localStorage.getItem(key)).toBeNull()

    writeMeetingCreateLocalDraft(USER_ID, {
      step: 0,
      form: { ...createInitialMeetingForm(9), title: '삭제할 초안' },
      questions: [],
      formDescription: '',
    })
    expect(clearMeetingCreateLocalDraft(USER_ID)).toBe(true)
    expect(readMeetingCreateLocalDraft(USER_ID)).toBeUndefined()
  })

  it('복구한 질문의 가장 큰 key 다음 값을 사용한다', () => {
    const questions: DraftFormQuestion[] = [
      { key: 8, questionText: '질문 1', questionType: 'SHORT_TEXT', required: false },
      { key: 2, questionText: '질문 2', questionType: 'LONG_TEXT', required: true },
    ]
    expect(nextDraftQuestionKey(questions)).toBe(9)
    expect(nextDraftQuestionKey([])).toBe(1)
  })
})
