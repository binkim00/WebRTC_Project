import { LiveKitRoom } from '@livekit/components-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAuthSession } from '../../api/auth'
import {
  getCallSessionStatus,
  issueLiveKitAccessToken,
  type CallSessionStatusResponse,
  type LiveKitAccessTokenResponse,
} from '../../api/callSessions'
import { fetchMeetingQueue } from '../../api/fanMeetingParticipants'
import { fetchPublicFanMeetingDetail } from '../../api/fanMeetings'
import { isQueueNotInitialized } from '../../api/queue'
import { usePolling } from '../../hooks/usePolling'
import { Badge } from '../data-display'
import { AlertBanner } from '../feedback'
import { Button } from '../ui/Button'
import { ConnectedCallRoom } from './ConnectedCallRoom'
import type { VideoCallRoomProps } from './types'

export type { VideoCallRoomProps } from './types'

export function VideoCallRoom(props: VideoCallRoomProps) {
  const [connectionInfo, setConnectionInfo] = useState<LiveKitAccessTokenResponse>()
  const [sessionStatus, setSessionStatus] = useState<CallSessionStatusResponse>()
  const [connectionError, setConnectionError] = useState<string>()
  const [statusError, setStatusError] = useState<string>()
  const [recordingEnabled, setRecordingEnabled] = useState(false)
  const [recordingPolicyError, setRecordingPolicyError] = useState<string>()
  // 통화 시작 전에는 서버의 남은 시간이 0이라 카운트다운 대기 값으로 쓸 설정 값이 필요하다.
  const [callDurationSec, setCallDurationSec] = useState<number>()
  const [retryCount, setRetryCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [meetingClosed, setMeetingClosed] = useState<'ENDED' | 'CANCELED'>()
  /** 대기열에 앞으로 호출할 팬이 남아 있지 않은 상태다. */
  const [noPendingFan, setNoPendingFan] = useState(false)
  const navigate = useNavigate()

  const hostStaysConnected = props.hostStaysConnected ?? false

  /**
   * 방 입장 토큰을 발급받는 기준 세션이다.
   *
   * 호스트 토큰은 통화 세션이 아니라 팬미팅 Room에 대한 권한이므로, 팬이 교체될 때
   * 다시 발급받지 않는다. 이 값을 바꾸지 않는 한 LiveKitRoom의 token prop이 그대로 유지되어
   * 재연결이 일어나지 않는다. 연결이 끊겨 재입장이 필요할 때만 갱신한다.
   */
  const [connectSessionId, setConnectSessionId] = useState(props.callSessionId)
  /** 지금 진행 중인 통화 세션이다. 상태 폴링·남은 시간·종료 API가 이 값을 따른다. */
  const [activeCallSessionId, setActiveCallSessionId] = useState(props.callSessionId)

  // 주소의 세션이 바뀌면(팬 통화 진입 등) 두 값을 함께 맞춘다.
  useEffect(() => {
    setConnectSessionId(props.callSessionId)
    setActiveCallSessionId(props.callSessionId)
  }, [props.callSessionId])

  const loadConnectionInfo = useCallback(
    async (signal: AbortSignal) => {
      if (!connectSessionId) {
        setConnectionError('통화 연결에 필요한 callSessionId가 없습니다.')
        setLoading(false)
        return
      }

      setLoading(true)
      setConnectionInfo(undefined)
      setSessionStatus(undefined)
      setRecordingEnabled(false)
      setCallDurationSec(undefined)
      setConnectionError(undefined)
      setStatusError(undefined)
      setRecordingPolicyError(undefined)

      try {
        const authSession = getAuthSession()
        const authToken = authSession?.accessToken
        const [info, status] = await Promise.all([
          issueLiveKitAccessToken(connectSessionId, { authToken, signal }),
          getCallSessionStatus(connectSessionId, { authToken, signal }),
        ])

        // 녹화 여부와 통화 제한 시간은 통화 진입 시 서버 상세를 다시 읽어
        // 오래된 화면 값을 쓰지 않는다. 상세 조회는 모든 역할에 열려 있다.
        let shouldRecord = false
        let durationSec: number | undefined
        try {
          const meeting = await fetchPublicFanMeetingDetail(
            Number(props.meetingId),
            authToken,
            signal,
          )
          durationSec = meeting.meeting.operation.callDurationSec
          shouldRecord =
            authSession?.role === 'FAN' && meeting.meeting.operation.recordingEnabled
        } catch (error: unknown) {
          if (error instanceof DOMException && error.name === 'AbortError') throw error
          // 정책을 확인하지 못한 경우에는 개인정보 보호를 위해 녹화를 시작하지 않는다.
          // 카운트다운은 서버가 보내는 남은 시간으로 계속 동작하므로 통화 자체는 막지 않는다.
          if (authSession?.role === 'FAN') {
            setRecordingPolicyError('팬미팅 녹화 설정을 확인하지 못해 녹화를 시작하지 않았습니다.')
          }
        }

        if (signal.aborted) return
        setRecordingEnabled(shouldRecord)
        setCallDurationSec(durationSec)
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
    [connectSessionId, props.meetingId],
  )

  useEffect(() => {
    const abortController = new AbortController()
    void loadConnectionInfo(abortController.signal)
    return () => abortController.abort()
  }, [loadConnectionInfo, retryCount])

  /**
   * 끊긴 연결을 새 토큰으로 다시 붙인다.
   *
   * 재입장 시점의 진행 중 세션으로 토큰을 발급받아야 하므로 connectSessionId를 현재 세션에 맞춘다.
   * 두 값이 같아 상태가 바뀌지 않는 경우에도 retryCount로 재조회를 강제한다.
   */
  const handleReconnectNeeded = useCallback(() => {
    setConnectSessionId(activeCallSessionId)
    setRetryCount((count) => count + 1)
  }, [activeCallSessionId])

  /**
   * 호스트가 대기열의 현재 통화를 따라간다.
   *
   * 팬이 교체되면 진행 중인 통화 세션만 바꿔 끼우고 LiveKit 연결은 그대로 유지한다.
   * 다음 팬이 아직 없으면 마지막 세션(ENDED)을 유지해 화면이 대기 상태로 남는다.
   */
  const followCurrentCall = useCallback(
    async (signal: AbortSignal) => {
      const authToken = getAuthSession()?.accessToken
      if (!authToken) return

      try {
        const queue = await fetchMeetingQueue(props.meetingId, authToken, signal)
        const nextCallSessionId = queue.currentCall?.callSessionId
        if (nextCallSessionId) {
          setActiveCallSessionId(String(nextCallSessionId))
          setNoPendingFan(false)
          return
        }

        // 진행 중인 통화도 없고 앞으로 호출할 팬도 없으면 더 진행할 통화가 없다.
        // 이 상태에서 계속 대기 화면에 남기면 호스트가 나갈 시점을 알 수 없다.
        const hasPendingFan = queue.entries.some(
          (entry) =>
            entry.status === 'WAITING' ||
            entry.status === 'CALLED' ||
            entry.status === 'IN_CALL',
        )
        setNoPendingFan(!hasPendingFan)
      } catch (error: unknown) {
        if (signal.aborted) return
        // 팬미팅이 끝나 대기열이 정리되면 따라갈 통화가 없다. 오류로 다루지 않는다.
        // 이 경우 팬미팅 종료는 loadMeetingStatus가 별도로 감지한다.
        if (isQueueNotInitialized(error)) return
      }
    },
    [props.meetingId],
  )

  usePolling(followCurrentCall, {
    intervalMs: 3_000,
    enabled: hostStaysConnected && Boolean(connectionInfo),
  })

  // 통화 세션이 끝난 것과 팬미팅 전체가 끝난 것은 다르다. 호스트는 통화방에
  // 남아 있으므로 팬미팅 상태를 별도로 확인해 전체 종료를 놓치지 않는다.
  const loadMeetingStatus = useCallback(async (signal: AbortSignal) => {
    if (!hostStaysConnected || meetingClosed) return

    const authToken = getAuthSession()?.accessToken
    if (!authToken) return

    try {
      const detail = await fetchPublicFanMeetingDetail(Number(props.meetingId), authToken, signal)
      const status = detail.meeting.status
      if (status === 'ENDED' || status === 'CANCELED') {
        setMeetingClosed(status)
      }
    } catch {
      // 일시적인 조회 실패는 통화 화면을 끊지 않고 다음 polling에서 재확인한다.
    }
  }, [hostStaysConnected, meetingClosed, props.meetingId])

  usePolling(loadMeetingStatus, {
    intervalMs: 3_000,
    enabled: hostStaysConnected && Boolean(connectionInfo) && !meetingClosed,
  })

  /**
   * 진행 중이던 통화가 끝났고 대기열에 남은 팬도 없어 더 진행할 통화가 없는 상태다.
   *
   * 팬이 교체되는 중(다음 팬이 대기열에 있음)에는 성립하지 않으므로, 차례가 넘어갈 때마다
   * 통화 화면에서 튕겨 나가지 않는다. 마지막 팬까지 끝났을 때만 참이 된다.
   */
  const allCallsFinished =
    hostStaysConnected && noPendingFan && sessionStatus?.status === 'ENDED'

  useEffect(() => {
    if (!meetingClosed && !allCallsFinished) return

    const timer = window.setTimeout(() => navigate('/', { replace: true }), 3_000)
    return () => window.clearTimeout(timer)
  }, [allCallsFinished, meetingClosed, navigate])

  const refreshStatus = useCallback(
    async (signal: AbortSignal) => {
      if (!activeCallSessionId) return

      try {
        const status = await getCallSessionStatus(activeCallSessionId, {
          authToken: getAuthSession()?.accessToken,
          signal,
        })
        setSessionStatus(status)
        setStatusError(undefined)
      } catch (error: unknown) {
        if (signal.aborted) return
        setStatusError(
          error instanceof Error ? error.message : '통화 상태를 갱신하지 못했습니다.',
        )
      }
    },
    [activeCallSessionId],
  )

  // usePolling은 직렬 폴링이라 느린 요청이 겹쳐 오래된 통화 상태가 최신 상태를 덮지 않는다.
  // 차례가 바뀌면 activeCallSessionId가 변해 즉시 새 세션 상태를 읽는다.
  usePolling(refreshStatus, {
    intervalMs: 5_000,
    enabled: Boolean(activeCallSessionId) && Boolean(connectionInfo),
  })

  if (meetingClosed) {
    return (
      <div className="mx-auto grid max-w-3xl gap-6 py-10">
        <AlertBanner title={meetingClosed === 'CANCELED' ? '팬미팅이 취소되었습니다' : '팬미팅이 종료되었습니다'} variant="info">
          팬미팅이 종료되어 영상통화방을 나갑니다. 잠시 후 메인 화면으로 이동합니다.
        </AlertBanner>
      </div>
    )
  }

  if (allCallsFinished) {
    return (
      <div className="mx-auto grid max-w-3xl gap-6 py-10">
        <AlertBanner title="영상통화가 종료되었습니다" variant="info">
          대기열에 남은 팬이 없어 영상통화방을 나갑니다. 잠시 후 메인 화면으로 이동합니다.
        </AlertBanner>
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
      <ConnectedCallRoom
        {...props}
        callDurationSec={callDurationSec}
        // 종료·남은 시간·요약이 모두 진행 중인 세션을 따라야 하므로 주소 값이 아닌 활성 세션을 넘긴다.
        callSessionId={activeCallSessionId}
        onReconnectNeeded={handleReconnectNeeded}
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
