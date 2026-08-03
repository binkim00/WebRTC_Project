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
import { fetchPublicFanMeetingDetail } from '../../api/fanMeetings'
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
  const [recordingEnabled, setRecordingEnabled] = useState(false)
  const [recordingPolicyError, setRecordingPolicyError] = useState<string>()
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
      setConnectionInfo(undefined)
      setSessionStatus(undefined)
      setRecordingEnabled(false)
      setConnectionError(undefined)
      setStatusError(undefined)
      setRecordingPolicyError(undefined)

      try {
        const authSession = getAuthSession()
        const authToken = authSession?.accessToken
        const [info, status] = await Promise.all([
          issueLiveKitAccessToken(props.callSessionId, { authToken, signal }),
          getCallSessionStatus(props.callSessionId, { authToken, signal }),
        ])

        let shouldRecord = false
        if (authSession?.role === 'FAN') {
          try {
            // 녹화 여부는 통화 진입 시 서버 상세를 다시 읽어 오래된 화면 값을 사용하지 않는다.
            const meeting = await fetchPublicFanMeetingDetail(
              Number(props.meetingId),
              authToken,
              signal,
            )
            shouldRecord = meeting.meeting.operation.recordingEnabled
          } catch (error: unknown) {
            if (error instanceof DOMException && error.name === 'AbortError') throw error
            // 정책을 확인하지 못한 경우에는 개인정보 보호를 위해 녹화를 시작하지 않는다.
            setRecordingPolicyError('팬미팅 녹화 설정을 확인하지 못해 녹화를 시작하지 않았습니다.')
          }
        }

        if (signal.aborted) return
        setRecordingEnabled(shouldRecord)
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
    [isDesignPreview, props.callSessionId, props.meetingId],
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
    let timer: number | undefined
    const controller = new AbortController()

    const refreshStatus = async () => {
      try {
        const status = await getCallSessionStatus(callSessionId, {
          authToken: getAuthSession()?.accessToken,
          signal: controller.signal,
        })

        if (active) {
          setSessionStatus(status)
          setStatusError(undefined)
        }
      } catch (error: unknown) {
        if (active && !(error instanceof DOMException && error.name === 'AbortError')) {
          setStatusError(
            error instanceof Error ? error.message : '통화 상태를 갱신하지 못했습니다.',
          )
        }
      } finally {
        // 느린 요청이 겹쳐 오래된 통화 상태가 최신 상태를 덮지 않도록 완료 후 다음 조회를 예약한다.
        if (active) timer = window.setTimeout(() => void refreshStatus(), 5_000)
      }
    }

    timer = window.setTimeout(() => void refreshStatus(), 5_000)

    return () => {
      active = false
      controller.abort()
      if (timer !== undefined) window.clearTimeout(timer)
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
      <ConnectedCallRoom
        {...props}
        recordingEnabled={recordingEnabled}
        recordingPolicyError={recordingPolicyError}
        sessionStatus={sessionStatus}
      />
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
