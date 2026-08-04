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
   * `POST /api/v1/attachments`로 먼저 업로드한 뒤 받은 식별자를 넘긴다.
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

/** 서비스 공지 상세를 조회한다. (인증 불필요) */
export async function getServiceNotice(
  noticeId: string | number,
  signal?: AbortSignal,
): Promise<NoticeDetailResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/service-notices/${encodeURIComponent(String(noticeId))}`,
    { method: 'GET', signal },
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
