import { ApiError } from './ApiError'
import { apiRequest } from './client'
import { buildQuery, unwrapEnvelope, type PageResponse } from './envelope'
import { deletePendingRecording, getPendingRecording } from './pendingRecordings'

const API_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

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

export type MyRecordingsQuery = {
  page?: number
  size?: number
}

const MAX_MY_RECORDING_PAGE_SIZE = 100

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
  // 백엔드는 확장자와 MIME 타입이 일치하는지 검증하므로 Blob 타입에 맞는 이름을 사용한다.
  const fileName =
    file instanceof File
      ? file.name
      : file.type.toLowerCase().startsWith('video/mp4')
        ? 'recording.mp4'
        : 'recording.webm'
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

/** 실제 내 녹화 목록 API의 모든 페이지를 순회한다. */
export async function getAllMyRecordings(
  authToken: string,
  signal?: AbortSignal,
): Promise<RecordingSummaryResponse[]> {
  const recordings: RecordingSummaryResponse[] = []
  let page = 0

  while (true) {
    signal?.throwIfAborted()
    const response = await getMyRecordings(
      { page, size: MAX_MY_RECORDING_PAGE_SIZE },
      authToken,
      signal,
    )
    recordings.push(...response.content)

    if (!response.hasNext || page + 1 >= response.totalPages) {
      return recordings
    }
    page += 1
  }
}

/** 첫 20건에만 의존하지 않고 특정 팬미팅의 내 녹화를 모든 페이지에서 찾는다. */
export async function findMyRecordingByMeeting(
  meetingId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<RecordingSummaryResponse | null> {
  const normalizedMeetingId = Number(meetingId)
  const recordings = await getAllMyRecordings(authToken, signal)
  return recordings.find((recording) => recording.meetingId === normalizedMeetingId) ?? null
}

/** 완료 화면에서 IndexedDB에 남은 녹화 파일을 실제 업로드 API로 재전송한다. */
export async function retryPendingRecordingUpload(
  callSessionId: string,
  authToken: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const pending = await getPendingRecording(callSessionId)
  if (!pending) return false

  try {
    await uploadRecording(
      callSessionId,
      pending.blob,
      pending.durationSec ?? undefined,
      authToken,
      signal,
    )
  } catch (error: unknown) {
    if (!(error instanceof ApiError && error.code === 'RECORDING_ALREADY_EXISTS')) {
      throw error
    }
  }

  await deletePendingRecording(callSessionId)
  return true
}

/** 백엔드가 발급한 상대 서명 URL에서 콘텐츠 토큰을 안전하게 읽는다. */
export function extractRecordingContentToken(downloadUrl: string): string | null {
  try {
    // 토큰 추출에는 호스트가 중요하지 않으므로 상대 API base 설정과 무관한 origin을 기준으로 삼는다.
    return new URL(downloadUrl, window.location.origin).searchParams.get('token')
  } catch {
    return null
  }
}

/**
 * 백엔드 서명 응답을 현재 API 호스트의 재생·다운로드 URL로 바꾼다.
 * 서버 계약대로 토큰이 있으면 정식 content 경로를 사용하고, 구버전 응답은 원래 URL로 폴백한다.
 */
export function resolveRecordingContentUrl(
  response: RecordingDownloadUrlResponse,
  download = false,
): string {
  const token = extractRecordingContentToken(response.downloadUrl)
  if (token) return buildRecordingContentUrl(response.recordingId, token, download)

  try {
    if (/^https?:\/\//i.test(response.downloadUrl)) return response.downloadUrl
    const path = response.downloadUrl.startsWith('/')
      ? response.downloadUrl
      : `/${response.downloadUrl}`
    return `${API_URL}${path}`
  } catch {
    return response.downloadUrl
  }
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
