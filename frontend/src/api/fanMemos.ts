import { apiRequest } from './client'
import { unwrapEnvelope } from './envelope'

export type FanMemoCreateRequest = {
  /** 회차와 무관한 메모는 생략 */
  meetingId?: number
  /** 최대 300자 */
  content: string
}

export type FanMemoCreateResponse = {
  memoId: number
  fanId: number
  meetingId: number | null
  content: string
  createdAt: string
}

export type FanMemoUpdateResponse = {
  memoId: number
  meetingId: number | null
  content: string
  createdAt: string
  updatedAt: string
}

export type FanMemoDeleteResponse = {
  memoId: number
  deleted: boolean
  deletedAt: string
}

/** 팬 메모를 작성한다. (인플루언서 전용) */
export async function createFanMemo(
  fanId: string | number,
  request: FanMemoCreateRequest,
  authToken: string,
  signal?: AbortSignal,
): Promise<FanMemoCreateResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/influencers/me/fans/${encodeURIComponent(String(fanId))}/memos`,
    { method: 'POST', authToken, signal, body: JSON.stringify(request) },
  )

  return unwrapEnvelope<FanMemoCreateResponse>(response)
}

/** 팬 메모를 수정한다. (인플루언서 전용) */
export async function updateFanMemo(
  memoId: string | number,
  request: { content: string },
  authToken: string,
  signal?: AbortSignal,
): Promise<FanMemoUpdateResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/fan-memos/${encodeURIComponent(String(memoId))}`,
    { method: 'PATCH', authToken, signal, body: JSON.stringify(request) },
  )

  return unwrapEnvelope<FanMemoUpdateResponse>(response)
}

/** 팬 메모를 삭제한다. (인플루언서 전용) */
export async function deleteFanMemo(
  memoId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<FanMemoDeleteResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/fan-memos/${encodeURIComponent(String(memoId))}`,
    { method: 'DELETE', authToken, signal },
  )

  return unwrapEnvelope<FanMemoDeleteResponse>(response)
}
