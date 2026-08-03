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
  /** 서버 초안을 한 번 저장한 뒤 새 팬미팅이 중복 생성되지 않도록 ID도 함께 복구한다. */
  createdMeetingId?: number
}

/** 로그인 사용자별로 생성 초안이 섞이지 않게 저장소 키를 만든다. */
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

/** 오래되었거나 손상된 JSON을 폼 상태로 사용하지 않도록 필수 구조를 검사한다. */
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
      draft.step <= 3 &&
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

/** 현재 입력에 복구할 가치가 있는 값이 있는지 판단해 빈 초안을 남기지 않는다. */
export function hasMeaningfulMeetingDraft(
  form: FanMeetingForm,
  questions: DraftFormQuestion[],
  formDescription: string,
  step: number,
  createdMeetingId?: number,
): boolean {
  return Boolean(
    createdMeetingId ||
      step > 0 ||
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

/** 사용자 계정의 로컬 생성 초안을 읽는다. 저장소 접근이 막혀 있으면 조용히 건너뛴다. */
export function readMeetingCreateLocalDraft(userId?: number): MeetingCreateLocalDraft | undefined {
  if (!userId || typeof window === 'undefined') return undefined

  try {
    const serialized = window.localStorage.getItem(storageKey(userId))
    if (!serialized) return undefined

    const parsed: unknown = JSON.parse(serialized)
    if (isMeetingCreateLocalDraft(parsed)) return parsed

    // 다른 버전 또는 손상된 초안은 반복해서 복구를 시도하지 않도록 제거한다.
    window.localStorage.removeItem(storageKey(userId))
    return undefined
  } catch {
    return undefined
  }
}

/** 단계 이동과 입력 변경을 브라우저 로컬 저장소에 원자적으로 기록한다. */
export function writeMeetingCreateLocalDraft(
  userId: number | undefined,
  draft: Omit<MeetingCreateLocalDraft, 'version' | 'savedAt'>,
): string | undefined {
  if (!userId || typeof window === 'undefined') return undefined

  const savedAt = new Date().toISOString()
  const value: MeetingCreateLocalDraft = {
    ...draft,
    version: LOCAL_DRAFT_VERSION,
    savedAt,
  }

  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(value))
    return savedAt
  } catch {
    return undefined
  }
}

/** 발행 성공 또는 사용자의 명시적 초기화 뒤에는 복구 초안을 제거한다. */
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
