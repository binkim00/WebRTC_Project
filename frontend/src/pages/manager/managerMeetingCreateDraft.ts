import type { FanMeetingForm } from '../../api/managerOperations'

/** 생성 마법사에서 편집하는 응모 질문 한 건이다. */
export type DraftFormQuestion = {
  key: number
  /** 서버 초안을 불러온 질문은 식별자를 보존해 전체 교체 저장 시에도 수정으로 처리한다. */
  questionId?: number
  questionText: string
  questionType: 'SHORT_TEXT' | 'LONG_TEXT'
  required: boolean
}

/** 브라우저에 저장하는 생성 마법사 초안의 현재 스키마 버전이다. */
const LOCAL_DRAFT_VERSION = 1
const LOCAL_DRAFT_PREFIX = 'melly-manager-meeting-create'

export type MeetingCreateLocalDraft = {
  version: typeof LOCAL_DRAFT_VERSION
  savedAt: string
  step: number
  form: FanMeetingForm
  questions: DraftFormQuestion[]
  formDescription: string
  /** 발행 도중 생성된 서버 DRAFT를 중복 생성하지 않도록 식별자를 함께 보존한다. */
  createdMeetingId?: number
}

function storageKey(userId: number): string {
  return `${LOCAL_DRAFT_PREFIX}:${userId}`
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isOptionalNullableNumber(value: unknown): value is number | null | undefined {
  return value === undefined || value === null || (typeof value === 'number' && Number.isFinite(value))
}

function isFanMeetingForm(value: unknown): value is FanMeetingForm {
  const form = asRecord(value)
  const application = asRecord(form?.application)
  const operation = asRecord(form?.operation)

  return Boolean(
    form &&
      typeof form.influencerId === 'number' &&
      typeof form.title === 'string' &&
      isNullableString(form.description) &&
      isNullableString(form.coverImageUrl) &&
      typeof form.scheduledStartAt === 'string' &&
      application &&
      typeof application.enabled === 'boolean' &&
      isNullableString(application.startAt) &&
      isNullableString(application.endAt) &&
      isNullableString(application.resultAnnouncementAt) &&
      typeof application.capacity === 'number' &&
      Number.isFinite(application.capacity) &&
      operation &&
      typeof operation.queueOpenAt === 'string' &&
      typeof operation.callDurationSec === 'number' &&
      Number.isFinite(operation.callDurationSec) &&
      typeof operation.recordingEnabled === 'boolean' &&
      typeof operation.translationEnabled === 'boolean' &&
      isOptionalNullableNumber(operation.reconnectGraceSec) &&
      isOptionalNullableNumber(operation.earlyStartMinutes) &&
      isOptionalNullableNumber(operation.maxRecallCount),
  )
}

function isDraftQuestion(value: unknown): value is DraftFormQuestion {
  const question = asRecord(value)
  return Boolean(
    question &&
      typeof question.key === 'number' &&
      Number.isInteger(question.key) &&
      (question.questionId === undefined ||
        (typeof question.questionId === 'number' && Number.isInteger(question.questionId))) &&
      typeof question.questionText === 'string' &&
      (question.questionType === 'SHORT_TEXT' || question.questionType === 'LONG_TEXT') &&
      typeof question.required === 'boolean',
  )
}

function isMeetingCreateLocalDraft(value: unknown): value is MeetingCreateLocalDraft {
  const draft = asRecord(value)
  return Boolean(
    draft &&
      draft.version === LOCAL_DRAFT_VERSION &&
      typeof draft.savedAt === 'string' &&
      typeof draft.step === 'number' &&
      Number.isInteger(draft.step) &&
      draft.step >= 0 &&
      draft.step <= 4 &&
      isFanMeetingForm(draft.form) &&
      Array.isArray(draft.questions) &&
      draft.questions.every(isDraftQuestion) &&
      typeof draft.formDescription === 'string' &&
      (draft.createdMeetingId === undefined ||
        (typeof draft.createdMeetingId === 'number' &&
          Number.isInteger(draft.createdMeetingId) &&
          draft.createdMeetingId > 0)),
  )
}

/** 생성 화면에서 사용하는 빈 폼을 한곳에서 만든다. */
export function createInitialMeetingForm(influencerId?: number): FanMeetingForm {
  return {
    influencerId: influencerId ?? 0,
    title: '',
    description: '',
    coverImageUrl: null,
    scheduledStartAt: '',
    application: {
      enabled: true,
      startAt: null,
      endAt: null,
      resultAnnouncementAt: null,
      capacity: 30,
    },
    operation: {
      queueOpenAt: '',
      callDurationSec: 180,
      recordingEnabled: true,
      translationEnabled: false,
      reconnectGraceSec: null,
      earlyStartMinutes: null,
      maxRecallCount: null,
    },
  }
}

/** 현재 화면에 서버 저장 전 변경 내용이 있는지 판단한다. */
export function hasMeaningfulMeetingDraft(
  form: FanMeetingForm,
  questions: DraftFormQuestion[],
  formDescription: string,
  _step: number,
  createdMeetingId?: number,
): boolean {
  return Boolean(
    createdMeetingId ||
      form.title.trim() ||
      form.description?.trim() ||
      form.coverImageUrl?.trim() ||
      form.scheduledStartAt ||
      form.application.startAt ||
      form.application.endAt ||
      form.application.resultAnnouncementAt ||
      form.operation.queueOpenAt ||
      formDescription.trim() ||
      questions.length > 0 ||
      form.application.enabled === false,
  )
}

/** 사용자 계정의 브라우저 초안을 읽는다. */
export function readMeetingCreateLocalDraft(userId?: number): MeetingCreateLocalDraft | undefined {
  if (!userId || typeof window === 'undefined') return undefined

  try {
    const serialized = window.localStorage.getItem(storageKey(userId))
    if (!serialized) return undefined

    const parsed: unknown = JSON.parse(serialized)
    if (isMeetingCreateLocalDraft(parsed)) return parsed

    window.localStorage.removeItem(storageKey(userId))
    return undefined
  } catch {
    return undefined
  }
}

/** 입력 변경을 사용자별 브라우저 저장소에 기록한다. */
export function writeMeetingCreateLocalDraft(
  userId: number | undefined,
  draft: Omit<MeetingCreateLocalDraft, 'version' | 'savedAt'>,
): string | undefined {
  if (!userId || typeof window === 'undefined') return undefined

  const savedAt = new Date().toISOString()
  try {
    window.localStorage.setItem(
      storageKey(userId),
      JSON.stringify({ ...draft, version: LOCAL_DRAFT_VERSION, savedAt }),
    )
    return savedAt
  } catch {
    return undefined
  }
}

/** 발행 성공 또는 새로 시작할 때 브라우저 초안을 제거한다. */
export function clearMeetingCreateLocalDraft(userId?: number): boolean {
  if (!userId || typeof window === 'undefined') return true

  try {
    window.localStorage.removeItem(storageKey(userId))
    return true
  } catch {
    return false
  }
}

/** 저장된 질문 키 다음 값을 계산해 복구 뒤 새 질문과 key가 충돌하지 않게 한다. */
export function nextDraftQuestionKey(questions: DraftFormQuestion[]): number {
  return questions.reduce((largest, question) => Math.max(largest, question.key), 0) + 1
}
