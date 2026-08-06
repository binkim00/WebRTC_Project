import { apiRequest } from './client'
import { translate } from '../i18n'

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
    throw new TypeError(translate('livekitTest.t1'))
  }

  const response = await apiRequest<unknown>('/api/v1/livekit/test-token', {
    method: 'POST',
    body: JSON.stringify({
      identity: normalizedIdentity,
      displayName: displayName?.trim() || normalizedIdentity,
    }),
  })

  if (typeof response !== 'object' || response === null) {
    throw new TypeError(translate('livekitTest.t2'))
  }

  const data = response as Record<string, unknown>
  if (
    typeof data.liveKitUrl !== 'string' ||
    typeof data.accessToken !== 'string' ||
    typeof data.roomName !== 'string' ||
    typeof data.identity !== 'string'
  ) {
    throw new TypeError(translate('livekitTest.t3'))
  }

  return {
    liveKitUrl: data.liveKitUrl,
    accessToken: data.accessToken,
    roomName: data.roomName,
    identity: data.identity,
  }
}
