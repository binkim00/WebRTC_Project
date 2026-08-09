import { apiRequest } from './client'
import { buildQuery, unwrapEnvelope, type PageResponse } from './envelope'

export type NoticeAttachmentResponse = {
  attachmentId: number
  originalFileName: string
  fileUrl: string
  contentType: string
  fileSize: number
}

export type NoticeSummaryResponse = {
  noticeId: number
  /** 서비스 공지는 null */
  meetingId: number | null
  title: string
  authorId: number
  authorNickname: string
  /** 첨부한 이미지가 있으면 대표 이미지 URL이고 없으면 null이다. */
  thumbnailUrl: string | null
  createdAt: string
  pinned: boolean
}

export type NoticeDetailResponse = {
  noticeId: number
  meetingId: number | null
  title: string
  content: string
  authorId: number
  authorNickname: string
  /** 첨부한 이미지 중 표시 순서가 가장 앞선 것의 URL이고 이미지가 없으면 null이다. */
  thumbnailUrl: string | null
  /** 표시 순서대로 정렬된 첨부파일이며 없으면 빈 배열이다. */
  attachments: NoticeAttachmentResponse[]
  createdAt: string
  updatedAt: string
  pinned: boolean
  canEdit: boolean
  canDelete: boolean
}

/** 공지 한 건에 연결할 수 있는 첨부파일 최대 개수이며 백엔드 검증과 같은 값이다. */
export const NOTICE_ATTACHMENT_MAX_COUNT = 10

export type NoticeCreateRequest = {
  title: string
  content: string
  /**
   * 연결할 첨부파일 식별자이며 보낸 순서가 표시 순서가 된다.
   *
   * `POST /api/v1/attachments`에 **attachmentType=NOTICE**로 먼저 업로드한 뒤 받은 식별자를
   * 넘긴다. 다른 용도로 올린 파일을 넘기면 `ATTACHMENT_TYPE_MISMATCH`로 거절된다.
   */
  attachmentIds?: number[]
}

export type NoticeCreateResponse = {
  noticeId: number
  meetingId: number | null
  title: string
  createdAt: string
}

export type NoticeUpdateRequest = {
  title?: string
  content?: string
  /**
   * 연결할 첨부파일 식별자 전체 목록이다.
   *
   * PATCH이므로 생략하면 기존 첨부를 유지하고, 보내면 그 목록이 연결 상태를 대신한다.
   * 빈 배열을 보내면 모든 첨부가 해제된다.
   */
  attachmentIds?: number[]
}

export type PostUpdateResponse = {
  postId: number
  meetingId: number | null
  title: string
  content: string
  updatedAt: string
}

export type PostDeleteResponse = {
  postId: number
  status: string
  deletedAt: string | null
}

type NoticesQuery = {
  keyword?: string
  page?: number
  size?: number
}

/** 서비스 공지 목록을 조회한다. (인증 불필요) */
export async function getServiceNotices(
  query: NoticesQuery,
  signal?: AbortSignal,
): Promise<PageResponse<NoticeSummaryResponse>> {
  const response = await apiRequest<unknown>(
    `/api/v1/service-notices${buildQuery(query)}`,
    { method: 'GET', signal },
  )

  return unwrapEnvelope<PageResponse<NoticeSummaryResponse>>(response)
}

/**
 * 서비스 공지 상세를 조회한다.
 *
 * 비로그인도 읽을 수 있지만, 응답의 `canEdit`·`canDelete`는 **토큰을 보낸 경우에만** 채워진다.
 * 서버는 로그인 정보가 없으면 두 값을 그냥 false로 내려 주므로, 수정·삭제 버튼을 이 값으로
 * 정하는 화면은 토큰을 반드시 넘겨야 한다.
 */
export async function getServiceNotice(
  noticeId: string | number,
  authToken?: string,
  signal?: AbortSignal,
): Promise<NoticeDetailResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/service-notices/${encodeURIComponent(String(noticeId))}`,
    { method: 'GET', authToken, signal },
  )

  return unwrapEnvelope<NoticeDetailResponse>(response)
}

/** 팬미팅 공지 목록을 조회한다. */
export async function getMeetingNotices(
  meetingId: string | number,
  query: NoticesQuery,
  signal?: AbortSignal,
): Promise<PageResponse<NoticeSummaryResponse>> {
  const response = await apiRequest<unknown>(
    `/api/v1/fan-meetings/${encodeURIComponent(String(meetingId))}/notices${buildQuery(query)}`,
    { method: 'GET', signal },
  )

  return unwrapEnvelope<PageResponse<NoticeSummaryResponse>>(response)
}

/** 팬미팅 공지 상세를 조회한다. */
export async function getMeetingNotice(
  meetingId: string | number,
  noticeId: string | number,
  signal?: AbortSignal,
): Promise<NoticeDetailResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/fan-meetings/${encodeURIComponent(String(meetingId))}/notices/${encodeURIComponent(String(noticeId))}`,
    { method: 'GET', signal },
  )

  return unwrapEnvelope<NoticeDetailResponse>(response)
}

/**
 * 서비스 전체 공지를 작성한다. (ADMIN 전용)
 *
 * 팬미팅 공지와 요청·응답 계약이 같아 타입을 함께 쓴다. 다른 점은 경로와 권한뿐이다.
 * 서비스 전체에 노출되는 공지라 백엔드가 `hasRole("ADMIN")`으로 제한한다.
 */
export async function createServiceNotice(
  request: NoticeCreateRequest,
  authToken: string,
  signal?: AbortSignal,
): Promise<NoticeCreateResponse> {
  const response = await apiRequest<unknown>('/api/v1/service-notices', {
    method: 'POST',
    authToken,
    signal,
    body: JSON.stringify(request),
  })

  return unwrapEnvelope<NoticeCreateResponse>(response)
}

/**
 * 서비스 전체 공지를 부분 수정한다. (ADMIN 전용)
 *
 * ADMIN이어도 **자기가 작성한 공지만** 수정할 수 있다. 작성자 확인은 백엔드
 * PostCommandService가 다시 수행하므로, 다른 운영자의 공지에는 권한 오류가 돌아온다.
 */
export async function updateServiceNotice(
  noticeId: string | number,
  request: NoticeUpdateRequest,
  authToken: string,
  signal?: AbortSignal,
): Promise<PostUpdateResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/service-notices/${encodeURIComponent(String(noticeId))}`,
    { method: 'PATCH', authToken, signal, body: JSON.stringify(request) },
  )

  return unwrapEnvelope<PostUpdateResponse>(response)
}

/** 서비스 전체 공지를 삭제한다. (ADMIN 전용, 작성자 본인만) */
export async function deleteServiceNotice(
  noticeId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<PostDeleteResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/service-notices/${encodeURIComponent(String(noticeId))}`,
    { method: 'DELETE', authToken, signal },
  )

  return unwrapEnvelope<PostDeleteResponse>(response)
}

/** 팬미팅 공지를 작성한다. (운영자 전용) */
export async function createMeetingNotice(
  meetingId: string | number,
  request: NoticeCreateRequest,
  authToken: string,
  signal?: AbortSignal,
): Promise<NoticeCreateResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/fan-meetings/${encodeURIComponent(String(meetingId))}/notices`,
    { method: 'POST', authToken, signal, body: JSON.stringify(request) },
  )

  return unwrapEnvelope<NoticeCreateResponse>(response)
}

/** 팬미팅 공지를 부분 수정한다. (운영자 전용) */
export async function updateMeetingNotice(
  meetingId: string | number,
  noticeId: string | number,
  request: NoticeUpdateRequest,
  authToken: string,
  signal?: AbortSignal,
): Promise<PostUpdateResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/fan-meetings/${encodeURIComponent(String(meetingId))}/notices/${encodeURIComponent(String(noticeId))}`,
    { method: 'PATCH', authToken, signal, body: JSON.stringify(request) },
  )

  return unwrapEnvelope<PostUpdateResponse>(response)
}

/** 팬미팅 공지를 삭제한다. (운영자 전용) */
export async function deleteMeetingNotice(
  meetingId: string | number,
  noticeId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<PostDeleteResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/fan-meetings/${encodeURIComponent(String(meetingId))}/notices/${encodeURIComponent(String(noticeId))}`,
    { method: 'DELETE', authToken, signal },
  )

  return unwrapEnvelope<PostDeleteResponse>(response)
}
