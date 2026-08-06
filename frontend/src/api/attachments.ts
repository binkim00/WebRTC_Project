import { ApiError } from './ApiError'
import { unwrapEnvelope } from './envelope'
import { translate } from '../i18n'

const API_URL = import.meta.env.VITE_API_BASE_URL ?? ''

/** 현재 백엔드가 지원하는 첨부 용도는 공지 하나뿐이다. */
export type AttachmentType = 'NOTICE'

/** 업로드 직후 받는 첨부 정보이며, attachmentId를 공지 생성·수정 요청에 넘겨 연결한다. */
export type AttachmentUploadResponse = {
  attachmentId: number
  originalFileName: string
  /** 백엔드가 만들어 주는 상대 경로(/api/v1/attachments/{id}/content)다. */
  fileUrl: string
  contentType: string
  fileSize: number
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

  const response = await fetch(
    `${API_URL}/api/v1/attachments?attachmentType=${encodeURIComponent(attachmentType)}`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { Authorization: `Bearer ${authToken}` },
      body: formData,
      signal,
    },
  )

  if (!response.ok) {
    throw await readUploadError(response)
  }

  return unwrapEnvelope<AttachmentUploadResponse>(await response.json())
}

/** 첨부파일 내용 URL을 만든다. download=true면 브라우저가 저장 대화상자를 띄운다. */
export function attachmentContentUrl(
  attachmentId: string | number,
  download = false,
): string {
  const suffix = download ? '?download=true' : ''
  return `${API_URL}/api/v1/attachments/${encodeURIComponent(String(attachmentId))}/content${suffix}`
}
