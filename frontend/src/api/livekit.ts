export type LiveKitConnectionInfo = {
  serverUrl: string
  token: string
  roomName: string
}

function isConnectionInfo(value: unknown): value is LiveKitConnectionInfo {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Record<string, unknown>

  return (
    typeof candidate.serverUrl === 'string' &&
    candidate.serverUrl.startsWith('wss://') &&
    typeof candidate.token === 'string' &&
    candidate.token.length > 0 &&
    typeof candidate.roomName === 'string' &&
    candidate.roomName.length > 0
  )
}

export async function getLiveKitConnectionInfo(
  fanMeetingId: string,
  signal?: AbortSignal,
): Promise<LiveKitConnectionInfo> {
  const response = await fetch(
    `/api/fan-meetings/${encodeURIComponent(fanMeetingId)}/livekit-token`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
      signal,
    },
  )

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('로그인이 만료되었습니다. 다시 로그인한 뒤 입장해 주세요.')
    }

    if (response.status === 403) {
      throw new Error('이 팬미팅 영상통화에 입장할 권한이 없습니다.')
    }

    if (response.status === 404) {
      throw new Error('팬미팅을 찾을 수 없거나 아직 통화방이 준비되지 않았습니다.')
    }

    throw new Error(`통화 연결 정보를 가져오지 못했습니다. (${response.status})`)
  }

  const data: unknown = await response.json()

  if (!isConnectionInfo(data)) {
    throw new Error('백엔드가 반환한 LiveKit 연결 정보 형식이 올바르지 않습니다.')
  }

  return data
}
