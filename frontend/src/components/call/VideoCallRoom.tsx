import { LiveKitRoom } from '@livekit/components-react'
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getAuthSession } from '../../api/auth'
import {
  getCallSessionStatus,
  issueLiveKitAccessToken,
  type CallSessionStatusResponse,
  type LiveKitAccessTokenResponse,
} from '../../api/callSessions'
import { Badge } from '../data-display'
import { AlertBanner } from '../feedback'
import { Button } from '../ui/Button'
import { ConnectedCallRoom } from './ConnectedCallRoom'
import { PreviewCallRoom } from './PreviewCallRoom'
import type { VideoCallRoomProps } from './types'

export type { VideoCallRoomProps } from './types'

export function VideoCallRoom(props: VideoCallRoomProps) {
  const [searchParams] = useSearchParams()
  const isDesignPreview = import.meta.env.DEV && searchParams.get('preview') === '1'
  const [connectionInfo, setConnectionInfo] = useState<LiveKitAccessTokenResponse>()
  const [sessionStatus, setSessionStatus] = useState<CallSessionStatusResponse>()
  const [connectionError, setConnectionError] = useState<string>()
  const [statusError, setStatusError] = useState<string>()
  const [retryCount, setRetryCount] = useState(0)
  const [loading, setLoading] = useState(!isDesignPreview)

  const loadConnectionInfo = useCallback(
    async (signal: AbortSignal) => {
      if (isDesignPreview) {
        return
      }

      if (!props.callSessionId) {
        setConnectionError('통화 연결에 필요한 callSessionId가 없습니다.')
        setLoading(false)
        return
      }

      setLoading(true)
      setConnectionError(undefined)
      setStatusError(undefined)

      try {
        const authToken = getAuthSession()?.accessToken
        const [info, status] = await Promise.all([
          issueLiveKitAccessToken(props.callSessionId, { authToken, signal }),
          getCallSessionStatus(props.callSessionId, { authToken, signal }),
        ])
        setConnectionInfo(info)
        setSessionStatus(status)
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
    [isDesignPreview, props.callSessionId],
  )

  useEffect(() => {
    const abortController = new AbortController()
    void loadConnectionInfo(abortController.signal)
    return () => abortController.abort()
  }, [loadConnectionInfo, retryCount])

  useEffect(() => {
    const callSessionId = props.callSessionId

    if (isDesignPreview || !callSessionId || !connectionInfo) {
      return
    }

    let active = true

    const refreshStatus = async () => {
      try {
        const status = await getCallSessionStatus(callSessionId, {
          authToken: getAuthSession()?.accessToken,
        })

        if (active) {
          setSessionStatus(status)
          setStatusError(undefined)
        }
      } catch (error: unknown) {
        if (active) {
          setStatusError(
            error instanceof Error ? error.message : '통화 상태를 갱신하지 못했습니다.',
          )
        }
      }
    }

    const intervalId = window.setInterval(() => void refreshStatus(), 5000)

    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [connectionInfo, isDesignPreview, props.callSessionId])

  if (isDesignPreview) {
    return <PreviewCallRoom {...props} />
  }

  if (!connectionInfo || !sessionStatus) {
    return (
      <div className="mx-auto grid max-w-3xl gap-6 py-10">
        <header>
          <Badge variant="primary">{props.screenId}</Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">
            영상 통화
          </h1>
          <p className="mt-3 text-[var(--color-text-secondary)]">
            통화 세션 ID: <span className="font-mono">{props.callSessionId ?? '없음'}</span>
          </p>
        </header>
        <AlertBanner
          title={loading ? 'LiveKit 입장 정보 확인 중' : '영상통화에 입장할 수 없습니다'}
          variant={loading ? 'info' : 'error'}
        >
          {loading
            ? '백엔드에서 LiveKit 접속 토큰과 통화 상태를 요청하고 있습니다.'
            : connectionError}
        </AlertBanner>
        {!loading ? (
          <div>
            <Button onClick={() => setRetryCount((count) => count + 1)}>다시 시도</Button>
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
      serverUrl={connectionInfo.liveKitUrl}
      token={connectionInfo.accessToken}
      video={cameraId ? { deviceId: { exact: cameraId } } : true}
    >
      <ConnectedCallRoom {...props} sessionStatus={sessionStatus} />
      {connectionError ? (
        <div className="mt-4">
          <AlertBanner title="LiveKit 연결 오류" variant="error">
            {connectionError}
          </AlertBanner>
        </div>
      ) : null}
      {statusError ? (
        <div className="mt-4">
          <AlertBanner title="통화 상태 갱신 오류" variant="warning">
            {statusError}
          </AlertBanner>
        </div>
      ) : null}
    </LiveKitRoom>
  )
}
