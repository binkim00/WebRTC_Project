import { LiveKitRoom } from '@livekit/components-react'
import { useCallback, useEffect, useState } from 'react'
import {
  getLiveKitConnectionInfo,
  type LiveKitConnectionInfo,
} from '../../api/livekit'
import { AlertBanner } from '../feedback'
import { Button } from '../ui/Button'
import { CallRoomHeader } from './CallRoomHeader'
import { ConnectedCallRoom } from './ConnectedCallRoom'
import type { VideoCallRoomProps } from './types'

export type { VideoCallRoomProps } from './types'

export function VideoCallRoom(props: VideoCallRoomProps) {
  const [connectionInfo, setConnectionInfo] = useState<LiveKitConnectionInfo>()
  const [connectionError, setConnectionError] = useState<string>()
  const [retryCount, setRetryCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const loadConnectionInfo = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true)
      setConnectionError(undefined)

      try {
        const info = await getLiveKitConnectionInfo(props.meetingId, signal)
        setConnectionInfo(info)
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        setConnectionInfo(undefined)
        setConnectionError(
          error instanceof Error
            ? error.message
            : 'LiveKit 통화 연결 정보를 가져오지 못했습니다.',
        )
      } finally {
        if (!signal.aborted) {
          setLoading(false)
        }
      }
    },
    [props.meetingId],
  )

  useEffect(() => {
    const abortController = new AbortController()
    void loadConnectionInfo(abortController.signal)
    return () => abortController.abort()
  }, [loadConnectionInfo, retryCount])

  if (!connectionInfo) {
    return (
      <div className="grid gap-6">
        <CallRoomHeader meetingId={props.meetingId} screenId={props.screenId} />
        <AlertBanner
          title={loading ? 'LiveKit 입장 정보 확인 중' : '영상통화에 입장할 수 없습니다'}
          variant={loading ? 'info' : 'error'}
        >
          {loading
            ? '백엔드에서 이 팬미팅의 LiveKit 접속 토큰을 요청하고 있습니다.'
            : connectionError}
        </AlertBanner>
        {!loading ? (
          <div>
            <Button onClick={() => setRetryCount((count) => count + 1)}>
              다시 시도
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  const cameraId = window.sessionStorage.getItem('melly-camera-id') || undefined
  const microphoneId = window.sessionStorage.getItem('melly-microphone-id') || undefined

  return (
    <LiveKitRoom
      audio={microphoneId ? { deviceId: { exact: microphoneId } } : true}
      connect
      onError={(error) => setConnectionError(error.message)}
      onMediaDeviceFailure={() => {
        setConnectionError(
          '카메라 또는 마이크를 사용할 수 없습니다. 브라우저 권한과 장치 연결을 확인해 주세요.',
        )
      }}
      serverUrl={connectionInfo.serverUrl}
      token={connectionInfo.token}
      video={cameraId ? { deviceId: { exact: cameraId } } : true}
    >
      <ConnectedCallRoom {...props} />
      {connectionError ? (
        <div className="mt-4">
          <AlertBanner title="LiveKit 연결 오류" variant="error">
            {connectionError}
          </AlertBanner>
        </div>
      ) : null}
    </LiveKitRoom>
  )
}
