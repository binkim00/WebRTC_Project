import { ApiError } from './ApiError'
import { apiRequest } from './client'
import { buildQuery, unwrapEnvelope, type PageResponse } from './envelope'

export type ApplicationStatus = 'SUBMITTED' | 'WITHDRAWN' | 'SELECTED' | 'NOT_SELECTED'

export type ApplicationQuestionType =
  | 'SHORT_TEXT'
  | 'LONG_TEXT'
  | 'SINGLE_CHOICE'
  | 'MULTIPLE_CHOICE'

export type ApplicationAnswerRequest = {
  questionId: number
  /** 주관식 답변 본문이며 객관식이면 보내지 않는다 */
  value?: string
  /** 객관식에서 고른 선택지이며 주관식이면 보내지 않는다 */
  optionIds?: number[]
}

export type ApplicationSubmitRequest = {
  /** 개인정보 수집 및 이용 동의 */
  personalInformationConsent: boolean
  /** 녹화·보관 동의. 녹화를 쓰지 않는 팬미팅에서는 서버가 검사하지 않는다 */
  recordingConsent: boolean
  /** 팬미팅 참여 규칙 동의 */
  participationConsent: boolean
  /** 최대 10개 */
  answers: ApplicationAnswerRequest[]
}

export type ApplicationSubmitResponse = {
  applicationId: number
  applicationStatus: ApplicationStatus
  submittedAt: string
}

export type ApplicationWithdrawResponse = {
  applicationId: number
  applicationStatus: ApplicationStatus
  withdrawnAt: string
}

export type MyApplicationResponse = {
  applicationId: number
  applicationStatus: ApplicationStatus
  submittedAt: string
  resultDecidedAt: string | null
  participantId: number | null
  callOrder: number | null
  callOrderSource: string | null
  meetingId: number
  meetingTitle: string
  coverImageUrl: string | null
  influencerName: string
  scheduledStartAt: string
}

export type MyApplicationSummaryResponse = {
  applicationId: number
  meetingId: number
  meetingTitle: string
  coverImageUrl: string | null
  influencerName: string
  scheduledStartAt: string
  applicationStatus: ApplicationStatus
  resultDecidedAt: string | null
  callOrder: number | null
}

export type ApplicantAnswerResponse = {
  questionId: number
  questionText: string
  /** 객관식이면 고른 선택지 문구를 쉼표로 이어 붙인 값이다 */
  answerText: string
  /** 객관식에서 고른 선택지 식별자이며 주관식이면 빈 배열이다 */
  selectedOptionIds: number[]
}

export type ApplicantResponse = {
  applicationId: number
  fanId: number
  nickname: string
  profileImageUrl: string | null
  applicationStatus: ApplicationStatus
  submittedAt: string
  answers: ApplicantAnswerResponse[]
}

/** totalApplications는 필터와 무관한 전체 유효 응모 수, totalElements는 필터 적용 결과 수다. */
export type ApplicantListResponse = {
  totalApplications: number
  content: ApplicantResponse[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  hasNext: boolean
}

export type QuestionStatResponse = {
  questionId: number
  questionText: string
  /** 답변 행 수가 아니라 응답한 응모 수라 복수 선택에서도 부풀지 않는다 */
  responseCount: number
  /** 선택지 식별자별 선택 수이며 주관식 질문이면 null */
  optionCounts: Record<string, number> | null
}

export type ApplicationStatisticsResponse = {
  totalApplications: number
  submittedCount: number
  selectedCount: number
  notSelectedCount: number
  questionStats: QuestionStatResponse[]
}

export type DrawResultResponse = {
  selectedCount: number
  notSelectedCount: number
  participantCount: number
  drawCompletedAt: string
}

export type ResultPublishResponse = {
  publishedAt: string
  notificationCount: number
  resultStatus: string
}

export type ApplicationFormOptionResponse = {
  optionId: number
  optionText: string
  displayOrder: number
}

export type ApplicationFormQuestionResponse = {
  questionId: number
  questionText: string
  questionType: ApplicationQuestionType
  required: boolean
  displayOrder: number
  /** 객관식 질문의 선택지이며 주관식 질문이면 빈 배열이다 */
  options: ApplicationFormOptionResponse[]
}

export type ApplicationFormResponse = {
  formId: number
  formDescription: string | null
  questions: ApplicationFormQuestionResponse[]
}

export type ApplicationFormOptionSaveRequest = {
  /** 기존 선택지 수정 시에만 지정하며 새 선택지면 생략한다 */
  optionId?: number | null
  optionText: string
  displayOrder: number
}

export type ApplicationFormQuestionSaveRequest = {
  /** 기존 질문 수정 시에만 지정하며 새 질문이면 생략한다 */
  questionId?: number | null
  questionText: string
  questionType: ApplicationQuestionType
  required: boolean
  displayOrder: number
  /** 객관식 질문은 선택지 2~10개가 필요하고 주관식 질문은 생략한다 */
  options?: ApplicationFormOptionSaveRequest[]
}

export type ApplicationFormSaveRequest = {
  formDescription?: string | null
  /** 전체 교체 방식이며 목록에 없는 기존 질문은 삭제된다 */
  questions: ApplicationFormQuestionSaveRequest[]
}

export type ApplicationFormSaveResponse = {
  formId: number
  meetingId: number
  formDescription: string | null
  questions: ApplicationFormQuestionResponse[]
  updatedAt: string
}

type MyApplicationsQuery = {
  applicationStatus?: ApplicationStatus
  page?: number
  size?: number
}

type AllMyApplicationsQuery = Omit<MyApplicationsQuery, 'page' | 'size'>

/** 백엔드가 한 번에 허용하는 내 응모 목록의 최대 페이지 크기다. */
const MAX_MY_APPLICATION_PAGE_SIZE = 100

type ApplicantsQuery = {
  applicationStatus?: ApplicationStatus
  keyword?: string
  page?: number
  size?: number
}

/** 팬미팅에 응모를 제출한다. */
export async function submitApplication(
  meetingId: string | number,
  request: ApplicationSubmitRequest,
  authToken: string,
  signal?: AbortSignal,
): Promise<ApplicationSubmitResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/fan-meetings/${encodeURIComponent(String(meetingId))}/applications`,
    { method: 'POST', authToken, signal, body: JSON.stringify(request) },
  )

  return unwrapEnvelope<ApplicationSubmitResponse>(response)
}

/** 내 응모를 취소한다. */
export async function withdrawApplication(
  meetingId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<ApplicationWithdrawResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/fan-meetings/${encodeURIComponent(String(meetingId))}/applications/me`,
    { method: 'DELETE', authToken, signal },
  )

  return unwrapEnvelope<ApplicationWithdrawResponse>(response)
}

/** 특정 팬미팅의 내 응모 결과를 조회한다. 응모 내역이 없으면 null을 반환한다. (FAN 전용) */
export async function getMyApplication(
  meetingId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<MyApplicationResponse | null> {
  try {
    const response = await apiRequest<unknown>(
      `/api/v1/fan-meetings/${encodeURIComponent(String(meetingId))}/applications/me`,
      { method: 'GET', authToken, signal },
    )

    return unwrapEnvelope<MyApplicationResponse>(response)
  } catch (error) {
    // 백엔드는 응모 내역이 없으면 APPLICATION_NOT_FOUND(404)를 반환한다.
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/** 내 응모 내역 목록을 조회한다. */
export async function getMyApplications(
  query: MyApplicationsQuery,
  authToken: string,
  signal?: AbortSignal,
): Promise<PageResponse<MyApplicationSummaryResponse>> {
  const response = await apiRequest<unknown>(
    `/api/v1/users/me/applications${buildQuery(query)}`,
    { method: 'GET', authToken, signal },
  )

  return unwrapEnvelope<PageResponse<MyApplicationSummaryResponse>>(response)
}

/**
 * 내 응모 내역을 백엔드 페이지가 끝날 때까지 가져온다.
 *
 * 팬미팅 히스토리는 응모 내역과 팬미팅 상세를 합쳐야 정확한 진행 상태를 알 수 있다.
 * 존재하지 않는 통합 목록 엔드포인트를 만들지 않고, 실제 `/users/me/applications`
 * 계약의 페이지를 순회해 한 목록으로 조합한다.
 */
export async function getAllMyApplications(
  query: AllMyApplicationsQuery,
  authToken: string,
  signal?: AbortSignal,
): Promise<MyApplicationSummaryResponse[]> {
  const applications: MyApplicationSummaryResponse[] = []
  let page = 0

  while (true) {
    signal?.throwIfAborted()
    const response = await getMyApplications(
      { ...query, page, size: MAX_MY_APPLICATION_PAGE_SIZE },
      authToken,
      signal,
    )
    applications.push(...response.content)

    if (!response.hasNext || page + 1 >= response.totalPages) {
      return applications
    }
    page += 1
  }
}

/** 응모자 목록을 조회한다. (운영자 전용) */
export async function getApplicants(
  meetingId: string | number,
  query: ApplicantsQuery,
  authToken: string,
  signal?: AbortSignal,
): Promise<ApplicantListResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/fan-meetings/${encodeURIComponent(String(meetingId))}/applications${buildQuery(query)}`,
    { method: 'GET', authToken, signal },
  )

  return unwrapEnvelope<ApplicantListResponse>(response)
}

/** 응모 현황 통계를 조회한다. (운영자 전용) */
export async function getApplicationStatistics(
  meetingId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<ApplicationStatisticsResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/fan-meetings/${encodeURIComponent(String(meetingId))}/applications/statistics`,
    { method: 'GET', authToken, signal },
  )

  return unwrapEnvelope<ApplicationStatisticsResponse>(response)
}

/** 당첨자를 추첨한다. (운영자 전용) */
export async function drawApplicationWinners(
  meetingId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<DrawResultResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/fan-meetings/${encodeURIComponent(String(meetingId))}/applications/draw`,
    { method: 'POST', authToken, signal },
  )

  return unwrapEnvelope<DrawResultResponse>(response)
}

/** 응모 결과를 공개한다. (운영자 전용) */
export async function publishApplicationResults(
  meetingId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<ResultPublishResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/fan-meetings/${encodeURIComponent(String(meetingId))}/applications/results/publish`,
    { method: 'POST', authToken, signal },
  )

  return unwrapEnvelope<ResultPublishResponse>(response)
}

/** 응모 폼을 조회한다. (인증 불필요) */
export async function getApplicationForm(
  meetingId: string | number,
  signal?: AbortSignal,
  authToken?: string,
): Promise<ApplicationFormResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/fan-meetings/${encodeURIComponent(String(meetingId))}/application-form`,
    { method: 'GET', authToken, signal },
  )

  return unwrapEnvelope<ApplicationFormResponse>(response)
}

/** 응모 폼을 저장한다. 질문 목록은 전체 교체된다. (운영자 전용) */
export async function saveApplicationForm(
  meetingId: string | number,
  request: ApplicationFormSaveRequest,
  authToken: string,
  signal?: AbortSignal,
): Promise<ApplicationFormSaveResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/fan-meetings/${encodeURIComponent(String(meetingId))}/application-form`,
    { method: 'PUT', authToken, signal, body: JSON.stringify(request) },
  )

  return unwrapEnvelope<ApplicationFormSaveResponse>(response)
}
