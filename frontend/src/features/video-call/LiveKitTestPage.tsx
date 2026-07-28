import { useState } from 'react'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference,
} from '@livekit/components-react'

import '@livekit/components-styles'

interface LiveKitTokenResponse {
  liveKitUrl: string
  accessToken: string
  roomName: string
  identity: string
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''


function LiveKitTestPage() {
  const [identity, setIdentity] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [connectionInfo, setConnectionInfo] =
    useState<LiveKitTokenResponse | null>(null)

  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const handleJoin = async () => {
    const trimmedIdentity = identity.trim()

    if (!trimmedIdentity) {
      setErrorMessage('identity를 입력해주세요.')
      return
    }

    if (isLoading || connectionInfo) {
      return
    }

    setIsLoading(true)
    setErrorMessage('')

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/livekit/test-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            identity: trimmedIdentity,
            displayName: displayName.trim() || undefined,
          }),
        },
      )

      if (!response.ok) {
        const responseText = await response.text()

        throw new Error(
          `토큰 발급 실패 (${response.status}) ${
            responseText || response.statusText
          }`,
        )
      }

      const data: LiveKitTokenResponse = await response.json()

      setConnectionInfo(data)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : '영상통화 연결 중 오류가 발생했습니다.'

      setErrorMessage(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDisconnected = () => {
    setConnectionInfo(null)
  }

  if (connectionInfo) {
    return (
      <div
        data-lk-theme="default"
        style={{
          height: '100vh',
          backgroundColor: '#111',
        }}
      >
        <LiveKitRoom
          serverUrl={connectionInfo.liveKitUrl}
          token={connectionInfo.accessToken}
          connect={true}
          audio={true}
          video={true}
          onDisconnected={handleDisconnected}
          onError={(error) => {
            setErrorMessage(error.message)
          }}
          onMediaDeviceFailure={(failure, kind) => {
            setErrorMessage(
              `${kind ?? '미디어 장치'}를 사용할 수 없습니다: ${
                failure ?? '알 수 없는 오류'
              }`,
            )
          }}
        >
          <VideoConference />

          {/* 상대방의 음성을 재생 */}
          <RoomAudioRenderer />
        </LiveKitRoom>
      </div>
    )
  }

  return (
    <main
      style={{
        maxWidth: '420px',
        margin: '80px auto',
        padding: '24px',
      }}
    >
      <h1>LiveKit 영상통화 테스트</h1>

      <p>두 브라우저에서 서로 다른 identity를 입력하세요.</p>

      <div style={{ display: 'grid', gap: '12px' }}>
        <label>
          사용자 ID
          <input
            value={identity}
            onChange={(event) => setIdentity(event.target.value)}
            placeholder="예: user-1"
            disabled={isLoading}
            style={{
              display: 'block',
              width: '100%',
              padding: '10px',
              marginTop: '4px',
            }}
          />
        </label>

        <label>
          표시 이름
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="예: 봉민"
            disabled={isLoading}
            style={{
              display: 'block',
              width: '100%',
              padding: '10px',
              marginTop: '4px',
            }}
          />
        </label>

        <button
          type="button"
          onClick={handleJoin}
          disabled={isLoading || !identity.trim()}
          style={{ padding: '12px' }}
        >
          {isLoading ? '접속 중...' : '영상통화 입장'}
        </button>
      </div>

      {errorMessage && (
        <p style={{ color: 'red', whiteSpace: 'pre-wrap' }}>
          {errorMessage}
        </p>
      )}
    </main>
  )
}

export default LiveKitTestPage