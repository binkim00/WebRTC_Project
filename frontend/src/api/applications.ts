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
  value: string
}

export type ApplicationSubmitRequest = {
  /** 현재 백엔드가 응모 시 영구 저장하는 필수 동의 값이다. */
  personalInformationConsent: boolean
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
  answerText: string
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
  responseCount: number
  /** 주관식 질문만 지원하므로 항상 null */
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

export type ApplicationFormQuestionResponse = {
  questionId: number
  questionText: string
  questionType: ApplicationQuestionType
  required: boolean
  displayOrder: number
}

export type ApplicationFormResponse = {
  formId: number
  formDescription: string | null
  questions: ApplicationFormQuestionResponse[]
}

export type ApplicationFormQuestionSaveRequest = {
  /** 기존 질문 수정 시에만 지정하며 새 질문이면 생략한다 */
  questionId?: number | null
  questionText: string
  /** SHORT_TEXT 또는 LONG_TEXT만 허용 */
  questionType: ApplicationQuestionType
  required: boolean
  displayOrder: number
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
