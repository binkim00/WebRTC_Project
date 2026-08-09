import { apiRequest } from './client'
import { buildQuery, unwrapEnvelope, type PageResponse } from './envelope'
import type { NoticeAttachmentResponse, PostDeleteResponse, PostUpdateResponse } from './notices'

export type { PostDeleteResponse, PostUpdateResponse }

export type CommunityPostSummaryResponse = {
  postId: number
  meetingId: number | null
  title: string
  authorId: number
  authorNickname: string
  /** 첨부한 이미지 중 표시 순서가 가장 앞선 것의 URL이고 이미지가 없으면 null이다. */
  thumbnailUrl: string | null
  createdAt: string
  pinned: boolean
}

export type CommunityPostDetailResponse = {
  postId: number
  meetingId: number | null
  title: string
  content: string
  authorId: number
  authorNickname: string
  thumbnailUrl: string | null
  /** 표시 순서대로 정렬된 첨부파일이며 없으면 빈 배열이다. */
  attachments: NoticeAttachmentResponse[]
  commentCount: number
  createdAt: string
  updatedAt: string
  pinned: boolean
  canEdit: boolean
  canDelete: boolean
}

export type CommunityPostCreateRequest = {
  title: string
  content: string
  /**
   * 연결할 첨부파일 식별자이며 보낸 순서가 표시 순서가 된다.
   *
   * `POST /api/v1/attachments`에 **attachmentType=COMMUNITY**로 먼저 업로드한 뒤 받은
   * 식별자를 넘긴다. NOTICE로 올린 파일을 넘기면 `ATTACHMENT_TYPE_MISMATCH`로 거절된다.
   */
  attachmentIds?: number[]
}

export type CommunityPostCreateResponse = {
  postId: number
  meetingId: number | null
  title: string
  createdAt: string
}

export type CommunityPostUpdateRequest = {
  title?: string
  content?: string
  /**
   * 연결할 첨부파일 식별자 전체 목록이다.
   *
   * PATCH이므로 생략하면 기존 첨부를 유지하고, 보내면 그 목록이 연결 상태를 대신한다.
   * 빈 배열을 보내면 모든 첨부가 해제된다. 공지 수정과 같은 규칙이다.
   */
  attachmentIds?: number[]
}

/** 게시글 한 건에 연결할 수 있는 첨부파일 최대 개수이며 공지와 같은 값이다. */
export const COMMUNITY_ATTACHMENT_MAX_COUNT = 10

export type CommentSummaryResponse = {
  commentId: number
  authorId: number
  authorNickname: string
  content: string
  createdAt: string
  updatedAt: string
  canEdit: boolean
  canDelete: boolean
}

export type CommentCreateResponse = {
  commentId: number
  authorId: number
  authorNickname: string
  content: string
  createdAt: string
}

export type CommentUpdateResponse = {
  commentId: number
  postId: number
  content: string
  updatedAt: string
}

export type CommentDeleteResponse = {
  commentId: number
  postId: number
  status: string
  /** 운영자 숨김 처리면 null */
  deletedAt: string | null
}

/** reason은 열거형이 아니라 자유 문자열이며 최대 100자다. detail은 선택값(최대 20,000자)이다. */
export type CommentReportCreateRequest = {
  reason: string
  detail?: string
}

export type CommentReportCreateResponse = {
  reportId: number
  commentId: number
  /** 접수 직후에는 항상 'RECEIVED' */
  reportStatus: string
  reportedAt: string
}

type CommunityPostsQuery = {
  keyword?: string
  page?: number
  size?: number
}

type CommentsQuery = {
  page?: number
  size?: number
}

/** 팬미팅 커뮤니티 게시글 목록을 조회한다. */
export async function getCommunityPosts(
  meetingId: string | number,
  query: CommunityPostsQuery,
  signal?: AbortSignal,
): Promise<PageResponse<CommunityPostSummaryResponse>> {
  const response = await apiRequest<unknown>(
    `/api/v1/fan-meetings/${encodeURIComponent(String(meetingId))}/community/posts${buildQuery(query)}`,
    { method: 'GET', signal },
  )

  return unwrapEnvelope<PageResponse<CommunityPostSummaryResponse>>(response)
}

/** 커뮤니티 게시글 상세를 조회한다. */
export async function getCommunityPost(
  postId: string | number,
  signal?: AbortSignal,
): Promise<CommunityPostDetailResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/community/posts/${encodeURIComponent(String(postId))}`,
    { method: 'GET', signal },
  )

  return unwrapEnvelope<CommunityPostDetailResponse>(response)
}

/** 커뮤니티 게시글을 작성한다. */
export async function createCommunityPost(
  meetingId: string | number,
  request: CommunityPostCreateRequest,
  authToken: string,
  signal?: AbortSignal,
): Promise<CommunityPostCreateResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/fan-meetings/${encodeURIComponent(String(meetingId))}/community/posts`,
    { method: 'POST', authToken, signal, body: JSON.stringify(request) },
  )

  return unwrapEnvelope<CommunityPostCreateResponse>(response)
}

/** 커뮤니티 게시글을 부분 수정한다. */
export async function updateCommunityPost(
  postId: string | number,
  request: CommunityPostUpdateRequest,
  authToken: string,
  signal?: AbortSignal,
): Promise<PostUpdateResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/community/posts/${encodeURIComponent(String(postId))}`,
    { method: 'PATCH', authToken, signal, body: JSON.stringify(request) },
  )

  return unwrapEnvelope<PostUpdateResponse>(response)
}

/** 커뮤니티 게시글을 삭제한다. */
export async function deleteCommunityPost(
  postId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<PostDeleteResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/community/posts/${encodeURIComponent(String(postId))}`,
    { method: 'DELETE', authToken, signal },
  )

  return unwrapEnvelope<PostDeleteResponse>(response)
}

/** 게시글의 댓글 목록을 조회한다. */
export async function getComments(
  postId: string | number,
  query: CommentsQuery,
  signal?: AbortSignal,
): Promise<PageResponse<CommentSummaryResponse>> {
  const response = await apiRequest<unknown>(
    `/api/v1/community/posts/${encodeURIComponent(String(postId))}/comments${buildQuery(query)}`,
    { method: 'GET', signal },
  )

  return unwrapEnvelope<PageResponse<CommentSummaryResponse>>(response)
}

/** 댓글을 작성한다. */
export async function createComment(
  postId: string | number,
  request: { content: string },
  authToken: string,
  signal?: AbortSignal,
): Promise<CommentCreateResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/community/posts/${encodeURIComponent(String(postId))}/comments`,
    { method: 'POST', authToken, signal, body: JSON.stringify(request) },
  )

  return unwrapEnvelope<CommentCreateResponse>(response)
}

/** 댓글을 수정한다. */
export async function updateComment(
  commentId: string | number,
  request: { content: string },
  authToken: string,
  signal?: AbortSignal,
): Promise<CommentUpdateResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/comments/${encodeURIComponent(String(commentId))}`,
    { method: 'PATCH', authToken, signal, body: JSON.stringify(request) },
  )

  return unwrapEnvelope<CommentUpdateResponse>(response)
}

/** 댓글을 삭제한다. */
export async function deleteComment(
  commentId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<CommentDeleteResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/comments/${encodeURIComponent(String(commentId))}`,
    { method: 'DELETE', authToken, signal },
  )

  return unwrapEnvelope<CommentDeleteResponse>(response)
}

/** 댓글을 신고한다. */
export async function reportComment(
  commentId: string | number,
  request: CommentReportCreateRequest,
  authToken: string,
  signal?: AbortSignal,
): Promise<CommentReportCreateResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/comments/${encodeURIComponent(String(commentId))}/reports`,
    { method: 'POST', authToken, signal, body: JSON.stringify(request) },
  )

  return unwrapEnvelope<CommentReportCreateResponse>(response)
}
