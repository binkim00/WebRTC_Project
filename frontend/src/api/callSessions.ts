import { apiRequest } from './client'
import { getAuthSession } from './auth'

export type CallSessionRequestOptions = {
  authToken?: string
  signal?: AbortSignal
}

export type LiveKitAccessTokenResponse = {
  liveKitUrl: string
  accessToken: string
  expiresAt: string
  reconnectAllowedUntil: string | null
}

export type CallSessionStatusResponse = {
  callSessionId: number
  status: string
  startedAt: string | null
  endsAt: string | null
  endedAt: string | null
  serverNow: string
  remainingSec: number
  reconnectAllowedUntil: string | null
  endReason: string | null
}

export type ForceEndCallSessionRequest = {
  reason: string
}

export type ForceEndCallSessionResponse = {
  callSessionId: number
  status: 'ENDED'
  endedAt: string
  endReason: 'FORCED'
}

export type CallSessionEndResponse = {
  callSessionId: number
  status: 'ENDED'
  endedAt: string
  endReason: 'NORMAL'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value == null || isNonEmptyString(value)
}

function requireCallSessionId(callSessionId: string): string {
  const normalizedId = callSessionId.trim()

  if (!normalizedId) {
    throw new TypeError('callSessionId는 비어 있을 수 없습니다.')
  }

  return encodeURIComponent(normalizedId)
}

function isLiveKitAccessTokenResponse(
  value: unknown,
): value is LiveKitAccessTokenResponse {
  if (!isRecord(value)) {
    return false
  }

  return (
    isNonEmptyString(value.liveKitUrl) &&
    (value.liveKitUrl.startsWith('wss://') ||
      (import.meta.env.DEV &&
        (value.liveKitUrl.startsWith('ws://localhost') ||
          value.liveKitUrl.startsWith('ws://127.0.0.1')))) &&
    isNonEmptyString(value.accessToken) &&
    isNonEmptyString(value.expiresAt) &&
    isOptionalString(value.reconnectAllowedUntil)
  )
}

function isCallSessionStatusResponse(
  value: unknown,
): value is CallSessionStatusResponse {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.callSessionId === 'number' &&
    Number.isFinite(value.callSessionId) &&
    isNonEmptyString(value.status) &&
    isOptionalString(value.startedAt) &&
    isOptionalString(value.endsAt) &&
    isOptionalString(value.endedAt) &&
    isNonEmptyString(value.serverNow) &&
    typeof value.remainingSec === 'number' &&
    Number.isFinite(value.remainingSec) &&
    value.remainingSec >= 0 &&
    isOptionalString(value.reconnectAllowedUntil) &&
    isOptionalString(value.endReason)
  )
}

function isForceEndCallSessionResponse(
  value: unknown,
): value is ForceEndCallSessionResponse {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.callSessionId === 'number' &&
    Number.isFinite(value.callSessionId) &&
    value.status === 'ENDED' &&
    isNonEmptyString(value.endedAt) &&
    value.endReason === 'FORCED'
  )
}

function isCallSessionEndResponse(value: unknown): value is CallSessionEndResponse {
  if (!isRecord(value)) return false

  return (
    typeof value.callSessionId === 'number' &&
    Number.isFinite(value.callSessionId) &&
    value.status === 'ENDED' &&
    isNonEmptyString(value.endedAt) &&
    value.endReason === 'NORMAL'
  )
}

function unwrapApiResponse(value: unknown): unknown {
  if (!isRecord(value) || typeof value.success !== 'boolean' || !('data' in value)) {
    return value
  }

  return value.data
}

function getRequestAuthToken(options: CallSessionRequestOptions): string | undefined {
  return options.authToken ?? getAuthSession()?.accessToken
}

export async function issueLiveKitAccessToken(
  callSessionId: string,
  options: CallSessionRequestOptions = {},
): Promise<LiveKitAccessTokenResponse> {
  const encodedId = requireCallSessionId(callSessionId)
  const response = await apiRequest<unknown>(
    `/api/v1/call-sessions/${encodedId}/access-token`,
    {
      method: 'POST',
      authToken: getRequestAuthToken(options),
      signal: options.signal,
    },
  )

  const data = unwrapApiResponse(response)
  if (!isLiveKitAccessTokenResponse(data)) {
    throw new TypeError('LiveKit 입장 토큰 응답 형식이 올바르지 않습니다.')
  }

  return data
}

export async function getCallSessionStatus(
  callSessionId: string,
  options: CallSessionRequestOptions = {},
): Promise<CallSessionStatusResponse> {
  const encodedId = requireCallSessionId(callSessionId)
  const response = await apiRequest<unknown>(
    `/api/v1/call-sessions/${encodedId}`,
    {
      method: 'GET',
      authToken: getRequestAuthToken(options),
      signal: options.signal,
    },
  )

  const data = unwrapApiResponse(response)
  if (!isCallSessionStatusResponse(data)) {
    throw new TypeError('통화 상태 응답 형식이 올바르지 않습니다.')
  }

  return data
}

export async function forceEndCallSession(
  callSessionId: string,
  request: ForceEndCallSessionRequest,
  options: CallSessionRequestOptions = {},
): Promise<ForceEndCallSessionResponse> {
  const encodedId = requireCallSessionId(callSessionId)
  const reason = request.reason.trim()

  if (!reason) {
    throw new TypeError('강제 종료 사유는 비어 있을 수 없습니다.')
  }
  if (reason.length > 255) {
    throw new TypeError('강제 종료 사유는 255자 이내로 입력해 주세요.')
  }

  const response = await apiRequest<unknown>(
    `/api/v1/call-sessions/${encodedId}/force-end`,
    {
      method: 'POST',
      authToken: getRequestAuthToken(options),
      signal: options.signal,
      body: JSON.stringify({ reason }),
    },
  )

  const data = unwrapApiResponse(response)
  if (!isForceEndCallSessionResponse(data)) {
    throw new TypeError('통화 강제 종료 응답 형식이 올바르지 않습니다.')
  }

  return data
}

/** 팬이 통화 종료를 선택했을 때 서버 세션도 정상 종료 상태로 전환한다. */
export async function endCallSessionByFan(
  callSessionId: string,
  options: CallSessionRequestOptions = {},
): Promise<CallSessionEndResponse> {
  const encodedId = requireCallSessionId(callSessionId)
  const response = await apiRequest<unknown>(
    `/api/v1/call-sessions/${encodedId}/end`,
    {
      method: 'POST',
      authToken: getRequestAuthToken(options),
      signal: options.signal,
    },
  )

  const data = unwrapApiResponse(response)
  if (!isCallSessionEndResponse(data)) {
    throw new TypeError('통화 정상 종료 응답 형식이 올바르지 않습니다.')
  }

  return data
}
