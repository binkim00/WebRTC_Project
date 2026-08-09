import { ApiError } from './ApiError'
import { apiRequest, refreshStoredSession } from './client'
import { unwrapEnvelope } from './envelope'
import { translate } from '../i18n'

const API_URL = import.meta.env.VITE_API_BASE_URL ?? ''

/**
 * 첨부 용도다. 업로드할 때 정하고 나중에 바꿀 수 없다.
 *
 * - `NOTICE`: 서비스 공지·팬미팅 공지에 붙인다.
 * - `COMMUNITY`: 커뮤니티 게시글에 붙인다.
 * - `MEETING_COVER`: 팬미팅 커버 이미지다. 게시글에 붙이지 않고 콘텐츠 URL을
 *   `coverImageUrl`에 넣어 쓰며, 이미지 파일만 받는다.
 *
 * 용도가 게시글 종류와 맞지 않으면 연결에서 `ATTACHMENT_TYPE_MISMATCH`로 거절된다.
 */
export type AttachmentType = 'NOTICE' | 'COMMUNITY' | 'MEETING_COVER'

/** 업로드 직후 받는 첨부 정보이며, attachmentId를 게시글 생성·수정 요청에 넘겨 연결한다. */
export type AttachmentUploadResponse = {
  attachmentId: number
  originalFileName: string
  /** 백엔드가 만들어 주는 상대 경로(/api/v1/attachments/{id}/content)다. */
  fileUrl: string
  contentType: string
  fileSize: number
}

/** 첨부 삭제 결과다. */
export type AttachmentDeleteResponse = {
  attachmentId: number
  deletedAt: string
}

/**
 * 실패 응답 본문을 공통 오류 형식으로 바꾼다.
 *
 * apiRequest를 거치지 않는 경로라 client.ts의 오류 변환을 쓸 수 없어 같은 규칙을 여기서 반복한다.
 */
async function readUploadError(response: Response): Promise<ApiError> {
  let code: string | undefined
  let message: string | undefined
  let detail: string | undefined

  try {
    const text = await response.text()
    if (text) {
      const data: unknown = JSON.parse(text)
      if (typeof data === 'object' && data !== null) {
        const error = data as Record<string, unknown>
        code = typeof error.code === 'string' ? error.code : undefined
        message = typeof error.message === 'string' ? error.message : undefined
        detail = typeof error.detail === 'string' ? error.detail : undefined
      }
    }
  } catch {
    // 본문 파싱 실패 시 상태 코드 기반 오류로 대체한다.
  }

  return new ApiError(
    response.status,
    code ?? `HTTP_${response.status}`,
    detail ?? message ?? translate('attachments.t1'),
    detail,
  )
}

/**
 * 멀티파트 요청을 보내고, 액세스 토큰이 만료됐으면 한 번 갱신해 다시 보낸다.
 *
 * 공통 apiRequest는 401을 만나면 토큰을 갱신해 재시도하지만, 멀티파트는 boundary를 브라우저가
 * 정해야 해서 그 경로를 탈 수 없다. 그 바람에 업로드만 갱신 없이 401로 끝나, 다른 화면은
 * 토큰이 조용히 갱신되며 멀쩡한데 파일 첨부만 "Invalid or expired access token."으로 실패했다.
 * 커버 이미지를 파일로만 올리게 된 뒤로는 이 경로가 막히면 팬미팅 등록 자체가 막힌다.
 *
 * @param url 요청 주소
 * @param method 업로드는 POST, 교체는 PUT이다
 * @param formData 보낼 멀티파트 본문
 * @param authToken 현재 액세스 토큰
 * @param signal 요청 취소 신호
 * @returns 서버 응답이며 갱신에 실패하면 첫 401 응답을 그대로 돌려준다
 */
async function sendMultipart(
  url: string,
  method: 'POST' | 'PUT',
  formData: FormData,
  authToken: string,
  signal?: AbortSignal,
): Promise<Response> {
  const send = (token: string) =>
    fetch(url, {
      method,
      credentials: 'include',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
      signal,
    })

  const response = await send(authToken)
  if (response.status !== 401) return response

  const refreshed = await refreshStoredSession()
  return refreshed ? send(refreshed.accessToken) : response
}

/**
 * 첨부파일을 업로드하고 공지에 연결할 attachmentId를 받는다.
 *
 * apiRequest는 Content-Type을 application/json으로 고정하므로 멀티파트는 fetch를 직접 쓴다.
 * boundary는 브라우저가 FormData를 보고 채워야 해서 Content-Type을 지정하지 않는다.
 */
export async function uploadAttachment(
  file: File,
  attachmentType: AttachmentType,
  authToken: string,
  signal?: AbortSignal,
): Promise<AttachmentUploadResponse> {
  const formData = new FormData()
  formData.append('file', file, file.name)

  const response = await sendMultipart(
    `${API_URL}/api/v1/attachments?attachmentType=${encodeURIComponent(attachmentType)}`,
    'POST',
    formData,
    authToken,
    signal,
  )

  if (!response.ok) {
    throw await readUploadError(response)
  }

  return unwrapEnvelope<AttachmentUploadResponse>(await response.json())
}

/**
 * 이미 올린 첨부의 내용을 새 파일로 교체한다.
 *
 * attachmentId와 콘텐츠 URL이 그대로라 게시글을 다시 저장하거나 커버 이미지 URL을 고치지
 * 않아도 새 파일이 보인다. 용도(NOTICE/COMMUNITY/MEETING_COVER)는 업로드 때 정한 그대로다.
 */
export async function replaceAttachment(
  attachmentId: string | number,
  file: File,
  authToken: string,
  signal?: AbortSignal,
): Promise<AttachmentUploadResponse> {
  const formData = new FormData()
  formData.append('file', file, file.name)

  const response = await sendMultipart(
    `${API_URL}/api/v1/attachments/${encodeURIComponent(String(attachmentId))}`,
    'PUT',
    formData,
    authToken,
    signal,
  )

  if (!response.ok) {
    throw await readUploadError(response)
  }

  return unwrapEnvelope<AttachmentUploadResponse>(await response.json())
}

/**
 * 첨부를 삭제한다. 게시글에 연결돼 있었다면 그 게시글에서도 함께 사라진다.
 *
 * 화면에서 첨부 목록을 다시 보내 연결을 끊는 방식(공지 PATCH의 attachmentIds)과 달리,
 * 아직 어디에도 연결하지 않은 업로드분을 정리할 때 쓴다.
 */
export async function deleteAttachment(
  attachmentId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<AttachmentDeleteResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/attachments/${encodeURIComponent(String(attachmentId))}`,
    { method: 'DELETE', authToken, signal },
  )

  return unwrapEnvelope<AttachmentDeleteResponse>(response)
}

/**
 * 서버가 내려준 첨부 URL을 이 브라우저에서 바로 열 수 있는 주소로 바꾼다.
 *
 * 백엔드는 `fileUrl`·`thumbnailUrl`을 `/api/v1/attachments/{id}/content` 같은 **상대 경로**로
 * 준다. 배포에서는 프론트와 API가 같은 오리진이라 그대로 열리지만, 로컬은 프론트가 5173,
 * 백엔드가 8080이라 그대로 쓰면 404가 난다. 그래서 상대 경로면 API 주소를 앞에 붙인다.
 * 운영자가 손으로 넣은 외부 커버 이미지 주소처럼 이미 절대 URL이면 그대로 둔다.
 */
export function resolveAttachmentUrl(url: string): string
export function resolveAttachmentUrl(url: null | undefined): null
export function resolveAttachmentUrl(url: string | null | undefined): string | null
export function resolveAttachmentUrl(url: string | null | undefined): string | null {
  if (!url) return null
  return url.startsWith('/') ? `${API_URL}${url}` : url
}

/** 첨부파일 내용 URL을 만든다. download=true면 브라우저가 저장 대화상자를 띄운다. */
export function attachmentContentUrl(
  attachmentId: string | number,
  download = false,
): string {
  const suffix = download ? '?download=true' : ''
  return `${API_URL}/api/v1/attachments/${encodeURIComponent(String(attachmentId))}/content${suffix}`
}
