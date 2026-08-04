import { LiveKitRoom } from '@livekit/components-react'
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getAuthSession } from '../../api/auth'
import { consentToRecording } from '../../api/recordings'
import {
  getCallSessionStatus,
  issueLiveKitAccessToken,
  type CallSessionStatusResponse,
  type LiveKitAccessTokenResponse,
} from '../../api/callSessions'
import { Badge } from '../data-display'
import { AlertBanner } from '../feedback'
import { Button } from '../ui/Button'
import { logCallConnectionDebug } from './connectionDebug'
import { ConnectedCallRoom } from './ConnectedCallRoom'
import { PreviewCallRoom } from './PreviewCallRoom'
import type { VideoCallRoomProps } from './types'

export type { VideoCallRoomProps } from './types'

export function VideoCallRoom(props: VideoCallRoomProps) {
  const [searchParams] = useSearchParams()
  const isDesignPreview = import.meta.env.DEV && searchParams.get('preview') === '1'
  const isConsentPreview = import.meta.env.DEV && searchParams.get('preview') === 'consent'
  const [authSession] = useState(() => getAuthSession())
  const requiresRecordingConsent = authSession?.role === 'FAN' || isConsentPreview
  const [recordingConsentGranted, setRecordingConsentGranted] = useState(
    !requiresRecordingConsent,
  )
  const [consentSubmitting, setConsentSubmitting] = useState(false)
  const [consentError, setConsentError] = useState<string>()
  const [connectionInfo, setConnectionInfo] = useState<LiveKitAccessTokenResponse>()
  const [sessionStatus, setSessionStatus] = useState<CallSessionStatusResponse>()
  const [connectionError, setConnectionError] = useState<string>()
  const [statusError, setStatusError] = useState<string>()
  const [retryCount, setRetryCount] = useState(0)
  const [loading, setLoading] = useState(!isDesignPreview && !requiresRecordingConsent)

  const loadConnectionInfo = useCallback(
    async (signal: AbortSignal) => {
      if (isDesignPreview) {
        return
      }

      if (requiresRecordingConsent && !recordingConsentGranted) {
        setLoading(false)
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
        const authToken = authSession?.accessToken
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
    [authSession?.accessToken, isDesignPreview, props.callSessionId,
      recordingConsentGranted, requiresRecordingConsent],
  )

  async function handleRecordingConsent() {
    if (!props.callSessionId || !authSession?.accessToken) {
      setConsentError('녹화 동의를 기록할 로그인 정보가 없습니다.')
      return
    }

    setConsentSubmitting(true)
    setConsentError(undefined)
    try {
      await consentToRecording(props.callSessionId, authSession.accessToken)
      setRecordingConsentGranted(true)
    } catch (error: unknown) {
      setConsentError(
        error instanceof Error ? error.message : '녹화 동의를 기록하지 못했습니다.',
      )
    } finally {
      setConsentSubmitting(false)
    }
  }

  useEffect(() => {
    const abortController = new AbortController()
    void loadConnectionInfo(abortController.signal)
    return () => abortController.abort()
  }, [loadConnectionInfo, retryCount])

  // 입장 정보 요청 경로와 분리해, 진단 로그가 실패해도 LiveKit 입장을 막지 않도록 한다.
  useEffect(() => {
    if (!connectionInfo) {
      return
    }

    logCallConnectionDebug({
      callSessionId: props.callSessionId,
      liveKitUrl: connectionInfo.liveKitUrl,
      accessToken: connectionInfo.accessToken,
      expiresAt: connectionInfo.expiresAt,
    })
  }, [connectionInfo, props.callSessionId])

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

  if (requiresRecordingConsent && !recordingConsentGranted) {
    return (
      <div className="mx-auto grid max-w-2xl gap-6 py-10">
        <header>
          <Badge variant="primary">녹화 동의</Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">
            영상통화 녹화에 동의해 주세요
          </h1>
        </header>
        <AlertBanner title="녹화 및 다시보기 안내" variant="info">
          이 통화는 팬미팅 다시보기 제공을 위해 녹화됩니다. 녹화 파일은 통화가 끝난 뒤
          서버에서 처리되며 보관 기간이 지나면 자동 삭제됩니다. 동의한 뒤 통화방에
          연결됩니다.
        </AlertBanner>
        {consentError ? (
          <AlertBanner title="녹화 동의를 기록하지 못했습니다" variant="error">
            {consentError}
          </AlertBanner>
        ) : null}
        <div>
          <Button loading={consentSubmitting} onClick={() => void handleRecordingConsent()}>
            녹화에 동의하고 입장
          </Button>
        </div>
      </div>
    )
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
