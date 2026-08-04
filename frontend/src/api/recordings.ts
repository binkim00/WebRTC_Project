import { ApiError } from './ApiError'
import { apiRequest } from './client'
import { buildQuery, unwrapEnvelope, type PageResponse } from './envelope'

const API_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export type RecordingUploadResponse = {
  recordingId: number
  callSessionId: number
  fileName: string
  contentType: string
  fileSizeBytes: number
  status: string
  completedAt: string
  availableUntil: string
}

export type RecordingDetailResponse = {
  recordingId: number
  callSessionId: number
  meetingId: number
  fileName: string
  contentType: string
  fileSizeBytes: number | null
  durationSec: number | null
  source: 'BROWSER_UPLOAD' | 'LIVEKIT_EGRESS'
  status: string
  failureCode: string | null
  failureMessage: string | null
  requestedAt: string | null
  egressStartedAt: string | null
  completedAt: string | null
  availableUntil: string | null
  playable: boolean
}

export type RecordingSummaryResponse = {
  recordingId: number
  callSessionId: number
  meetingId: number
  meetingTitle: string
  fileName: string
  contentType: string
  fileSizeBytes: number | null
  durationSec: number | null
  source: 'BROWSER_UPLOAD' | 'LIVEKIT_EGRESS'
  status: string
  failureCode: string | null
  completedAt: string | null
  availableUntil: string | null
  playable: boolean
}

export type RecordingConsentResponse = {
  callSessionId: number
  consentedAt: string
}

/** downloadUrl은 서명 토큰이 포함된 상대 경로(/api/v1/recordings/{id}/content?token=...)다. */
export type RecordingDownloadUrlResponse = {
  recordingId: number
  downloadUrl: string
  expiresAt: string
  expiresInSeconds: number
}

type MyRecordingsQuery = {
  page?: number
  size?: number
}

/** 팬이 통화방에 연결되기 전에 녹화 동의를 서버에 기록한다. */
export async function consentToRecording(
  callSessionId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<RecordingConsentResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/call-sessions/${encodeURIComponent(String(callSessionId))}/recordings/consent`,
    { method: 'POST', authToken, signal },
  )

  return unwrapEnvelope<RecordingConsentResponse>(response)
}

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
    detail ?? message ?? 'API 요청에 실패했습니다.',
    detail,
  )
}

/** 통화 녹화 파일을 멀티파트로 업로드한다. */
export async function uploadRecording(
  callSessionId: string | number,
  file: Blob,
  durationSec: number | undefined,
  authToken: string,
  signal?: AbortSignal,
): Promise<RecordingUploadResponse> {
  const formData = new FormData()
  const fileName = file instanceof File ? file.name : 'recording.webm'
  formData.append('file', file, fileName)

  const query = durationSec !== undefined ? `?durationSec=${encodeURIComponent(String(durationSec))}` : ''
  const response = await fetch(
    `${API_URL}/api/v1/call-sessions/${encodeURIComponent(String(callSessionId))}/recordings/upload${query}`,
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

  return unwrapEnvelope<RecordingUploadResponse>(await response.json())
}

/** 녹화 상세 정보를 조회한다. */
export async function getRecordingDetail(
  recordingId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<RecordingDetailResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/recordings/${encodeURIComponent(String(recordingId))}`,
    { method: 'GET', authToken, signal },
  )

  return unwrapEnvelope<RecordingDetailResponse>(response)
}

/** 녹화 재생·다운로드용 서명 URL을 발급한다. */
export async function issueRecordingDownloadUrl(
  recordingId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<RecordingDownloadUrlResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/recordings/${encodeURIComponent(String(recordingId))}/download-url`,
    { method: 'POST', authToken, signal },
  )

  return unwrapEnvelope<RecordingDownloadUrlResponse>(response)
}

/** 내 녹화 목록을 조회한다. */
export async function getMyRecordings(
  query: MyRecordingsQuery,
  authToken: string,
  signal?: AbortSignal,
): Promise<PageResponse<RecordingSummaryResponse>> {
  const response = await apiRequest<unknown>(
    `/api/v1/users/me/recordings${buildQuery(query)}`,
    { method: 'GET', authToken, signal },
  )

  return unwrapEnvelope<PageResponse<RecordingSummaryResponse>>(response)
}

/** 서명 토큰으로 재생·다운로드 가능한 절대 콘텐츠 URL을 만든다. */
export function buildRecordingContentUrl(
  recordingId: string | number,
  token: string,
  download = false,
): string {
  const query = buildQuery({ token, download: download ? true : undefined })
  return `${API_URL}/api/v1/recordings/${encodeURIComponent(String(recordingId))}/content${query}`
}
