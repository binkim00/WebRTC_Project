import { apiRequest } from './client'

export type CallSessionRequestOptions = {
  authToken?: string
  signal?: AbortSignal
}

export type LiveKitAccessTokenResponse = {
  liveKitUrl: string
  accessToken: string
  expiresAt: string
  reconnectAllowedUntil?: string
}

export type CallSessionStatusResponse = {
  callSessionId: string
  status: string
  startedAt?: string
  endsAt?: string
  endedAt?: string
  serverNow: string
  remainingSec: number
  reconnectAllowedUntil?: string
  endReason?: string
}

export type ForceEndCallSessionRequest = {
  reason: string
}

export type ForceEndCallSessionResponse = {
  callSessionId: string
  status: 'ENDED'
  endedAt: string
  endReason: 'FORCED'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isNonEmptyString(value)
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
    value.liveKitUrl.startsWith('wss://') &&
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
    isNonEmptyString(value.callSessionId) &&
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
    isNonEmptyString(value.callSessionId) &&
    value.status === 'ENDED' &&
    isNonEmptyString(value.endedAt) &&
    value.endReason === 'FORCED'
  )
}

export async function issueLiveKitAccessToken(
  callSessionId: string,
  options: CallSessionRequestOptions = {},
): Promise<LiveKitAccessTokenResponse> {
  const encodedId = requireCallSessionId(callSessionId)
  const data = await apiRequest<unknown>(
    `/api/v1/call-sessions/${encodedId}/access-token`,
    {
      method: 'POST',
      authToken: options.authToken,
      signal: options.signal,
    },
  )

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
  const data = await apiRequest<unknown>(
    `/api/v1/call-sessions/${encodedId}`,
    {
      method: 'GET',
      authToken: options.authToken,
      signal: options.signal,
    },
  )

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

  const data = await apiRequest<unknown>(
    `/api/v1/call-sessions/${encodedId}/force-end`,
    {
      method: 'POST',
      authToken: options.authToken,
      signal: options.signal,
      body: JSON.stringify({ reason }),
    },
  )

  if (!isForceEndCallSessionResponse(data)) {
    throw new TypeError('통화 강제 종료 응답 형식이 올바르지 않습니다.')
  }

  return data
}
