import { apiRequest } from './client'

export type LiveKitTestTokenResponse = {
  liveKitUrl: string
  accessToken: string
  roomName: string
  identity: string
}

export async function issueLiveKitTestToken(
  identity: string,
  displayName?: string,
): Promise<LiveKitTestTokenResponse> {
  const normalizedIdentity = identity.trim()
  if (!normalizedIdentity) {
    throw new TypeError('참가자 ID를 입력해 주세요.')
  }

  const response = await apiRequest<unknown>('/api/v1/livekit/test-token', {
    method: 'POST',
    body: JSON.stringify({
      identity: normalizedIdentity,
      displayName: displayName?.trim() || normalizedIdentity,
    }),
  })

  if (typeof response !== 'object' || response === null) {
    throw new TypeError('LiveKit 테스트 토큰 응답 형식이 올바르지 않습니다.')
  }

  const data = response as Record<string, unknown>
  if (
    typeof data.liveKitUrl !== 'string' ||
    typeof data.accessToken !== 'string' ||
    typeof data.roomName !== 'string' ||
    typeof data.identity !== 'string'
  ) {
    throw new TypeError('LiveKit 테스트 토큰 응답 형식이 올바르지 않습니다.')
  }

  return {
    liveKitUrl: data.liveKitUrl,
    accessToken: data.accessToken,
    roomName: data.roomName,
    identity: data.identity,
  }
}
