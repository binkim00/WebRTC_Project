import { LiveKitRoom } from '@livekit/components-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/auth'
import {
  getCallSessionStatus,
  isCallSessionEnded,
  issueLiveKitAccessToken,
  type CallSessionStatusResponse,
  type LiveKitAccessTokenResponse,
} from '../../api/callSessions'
import { fetchMeetingQueue, type MeetingQueue } from '../../api/fanMeetingParticipants'
import { fetchPublicFanMeetingDetail } from '../../api/fanMeetings'
import { isQueueNotInitialized } from '../../api/queue'
import { consentToRecording } from '../../api/recordings'
import { usePolling } from '../../hooks/usePolling'
import { Badge } from '../data-display'
import { AlertBanner } from '../feedback'
import { Button } from '../ui/Button'
import { ConnectedCallRoom } from './ConnectedCallRoom'
import { MeetingWrapUp } from './MeetingWrapUp'
import type { VideoCallRoomProps } from './types'
import { useTranslation } from '../../i18n'

export type { VideoCallRoomProps } from './types'

/** 상태 API가 잠시 실패해도 LiveKit 연결을 시작하고 다음 폴링에서 복구하기 위한 임시 상태다. */
function fallbackCallSessionStatus(callSessionId: string): CallSessionStatusResponse {
  const numericId = Number(callSessionId)
  return {
    callSessionId: Number.isFinite(numericId) ? numericId : 0,
    status: 'CONNECTING',
    startedAt: null,
    endsAt: null,
    endedAt: null,
    serverNow: new Date().toISOString(),
    remainingSec: 0,
    reconnectAllowedUntil: null,
    endReason: null,
    fanLanguage: null,
    influencerLanguage: null,
  }
}

export function VideoCallRoom(props: VideoCallRoomProps) {
  const { t } = useTranslation()
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
  /** 마지막으로 읽은 대기열이며, 팬미팅을 모두 마친 화면에서 진행 결과를 집계한다. */
  const [queueSnapshot, setQueueSnapshot] = useState<MeetingQueue>()

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
        setConnectionError(t('videoCallRoom.t6'))
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
        const [infoResult, statusResult] = await Promise.allSettled([
          issueLiveKitAccessToken(connectSessionId, { authToken, signal }),
          getCallSessionStatus(connectSessionId, { authToken, signal }),
        ])

        // LiveKit 토큰은 영상 입장에 필수지만 상태 조회는 타이머·종료 표시용 보조 정보다.
        // 둘을 Promise.all로 묶으면 상태 API의 일시 오류만으로 영상 화면 전체가 사라진다.
        if (infoResult.status === 'rejected') throw infoResult.reason
        const info = infoResult.value
        const status = statusResult.status === 'fulfilled'
          ? statusResult.value
          : fallbackCallSessionStatus(connectSessionId)
        if (statusResult.status === 'rejected') {
          if (
            statusResult.reason instanceof DOMException &&
            statusResult.reason.name === 'AbortError'
          ) {
            throw statusResult.reason
          }
          setStatusError(
            statusResult.reason instanceof Error
              ? statusResult.reason.message
              : t('videoCallRoom.t9'),
          )
        }

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
            setRecordingPolicyError(t('videoCallRoom.t7'))
          }
        }

        if (signal.aborted) return

        // 서버 Egress 녹화는 팬의 동의 시각이 기록돼 있을 때만 시작된다
        // (백엔드 RecordingEgressCoordinator.prepareStart). 통화가 ACTIVE로 바뀌는 순간
        // 서버가 녹화를 걸기 때문에 입장 전인 이 시점에 기록해야 한다. 동의 자체는 응모 화면에서
        // 필수 항목으로 이미 받았으므로 여기서 팬에게 다시 묻지 않고 서버에만 남긴다.
        if (shouldRecord && authToken) {
          try {
            await consentToRecording(connectSessionId, authToken, signal)
          } catch (error: unknown) {
            if (error instanceof DOMException && error.name === 'AbortError') throw error
            // 동의를 남기지 못하면 서버 녹화가 시작되지 않지만, 통화 자체는 막지 않는다.
            setRecordingPolicyError(t('videoCallRoom.t7'))
            console.warn('녹화 동의를 기록하지 못해 서버 녹화가 시작되지 않습니다.', error)
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
            : t('videoCallRoom.t8'),
        )
      } finally {
        if (!signal.aborted) {
          setLoading(false)
        }
      }
    },
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connectSessionId, props.meetingId],
  )

  useEffect(() => {
    const abortController = new AbortController()
    void loadConnectionInfo(abortController.signal)
    return () => abortController.abort()
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // 마지막 대기열 상태를 남겨 둔다. 팬미팅을 모두 마친 화면에서 진행 결과를 집계하는 데 쓴다.
        setQueueSnapshot(queue)
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
    hostStaysConnected && noPendingFan && Boolean(sessionStatus && isCallSessionEnded(sessionStatus))

  /**
   * 마지막 팬까지 끝난 뒤, 인플루언서가 마무리 화면으로 넘어가겠다고 직접 고른 상태다.
   *
   * 이 값 없이 `allCallsFinished`만으로 화면을 바꾸면 통화 화면이 통째로 사라지면서 옆 패널의
   * 메모 입력도 함께 없어져, 하필 **마지막 팬만** 메모를 남길 수 없었다. 넘어가는 시점을
   * 사용자가 정하게 해 마지막 팬의 메모를 저장할 시간을 준다.
   */
  const [wrapUpConfirmed, setWrapUpConfirmed] = useState(false)

  // 다음 팬을 다시 호출하면(운영 패널의 이어 호출 등) 마무리 상태를 되돌린다.
  useEffect(() => {
    if (!allCallsFinished) setWrapUpConfirmed(false)
  }, [allCallsFinished])

  /**
   * 팬미팅을 모두 마친 화면에서 보여 줄 진행 결과다.
   *
   * 마지막으로 읽은 대기열을 집계한다. 대기열을 못 읽었으면(undefined) 숫자를 보여 주지 않는다.
   * 통화까지 마친 팬과 못 만난 팬(노쇼·건너뜀)을 나눠 세어, 마무리 화면이 "무엇을 했는지"를
   * 말해 줄 수 있게 한다.
   */
  const finishedTally = useMemo(() => {
    const entries = queueSnapshot?.entries
    if (!entries?.length) return undefined

    const completed = entries.filter((entry) => entry.status === 'COMPLETED').length
    const missed = entries.filter(
      (entry) => entry.status === 'NO_SHOW' || entry.status === 'SKIPPED',
    ).length
    return { completed, missed }
  }, [queueSnapshot?.entries])

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
        // 통화가 시작된 세션의 상태 조회가 403·404로 거절되기 시작하면, 서버가 세션을 정리해
        // 팬이 더 이상 참가자가 아니라는 뜻이다. 이때 오류만 띄우고 폴링을 계속하면 종료 신호를
        // 영영 못 받아 팬이 통화 방에서 나가지 못하므로, 세션이 끝난 것으로 화면을 정리한다.
        if (
          !hostStaysConnected &&
          error instanceof ApiError &&
          (error.status === 403 || error.status === 404)
        ) {
          setSessionStatus((current) =>
            current && current.startedAt !== null && !isCallSessionEnded(current)
              ? { ...current, status: 'ENDED', endedAt: current.endedAt ?? current.serverNow }
              : current,
          )
          return
        }
        setStatusError(
          error instanceof Error ? error.message : t('videoCallRoom.t9'),
        )
      }
    },
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 폴링 콜백이 다시 만들어진다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeCallSessionId],
  )

  /**
   * 상대가 통화 종료를 알려 왔을 때 폴링 주기를 기다리지 않고 즉시 상태를 다시 읽는다.
   *
   * 알림 자체를 종료 근거로 쓰지 않는 것이 핵심이다. 참가자가 보낸 메시지는 신뢰할 수 없으므로
   * 화면 정리는 이 재조회로 확인한 서버 상태(`ENDED`)로만 진행한다.
   * 이 요청은 폴링과 별개라 자체 AbortController로 수명을 관리한다.
   */
  const handlePeerCallEnded = useCallback(() => {
    const controller = new AbortController()
    void refreshStatus(controller.signal)
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshStatus])

  // usePolling은 직렬 폴링이라 느린 요청이 겹쳐 오래된 통화 상태가 최신 상태를 덮지 않는다.
  // 차례가 바뀌면 activeCallSessionId가 변해 즉시 새 세션 상태를 읽는다.
  //
  // 통화 중에는 이 폴링이 **양쪽 화면 전환의 유일한 기준**이다(프론트는 타이머로 먼저 끊지 않는다).
  // 5초 주기였을 때는 팬이 끊긴 뒤 인플루언서 화면이 최대 5초 늦게 바뀌었으므로 1초로 줄인다.
  // 통화가 진행 중이 아닐 때(다음 팬 대기 등)는 급할 이유가 없어 3초로 되돌려 요청을 아낀다.
  // 백엔드가 call_ended LiveKit data message를 추가하면 그 이벤트가 1차 신호가 되고
  // 이 폴링은 보조 확인 수단으로 다시 완화할 수 있다.
  usePolling(refreshStatus, {
    intervalMs: sessionStatus?.status === 'ACTIVE' ? 1_000 : 3_000,
    enabled: Boolean(activeCallSessionId) && Boolean(connectionInfo),
  })

  // 팬미팅을 마친 뒤의 화면이다.
  //
  // 이전에는 안내 배너만 띄우고 3초 뒤 홈으로 강제 이동시켰다. 팬미팅을 끝까지 진행한
  // 인플루언서가 결과를 확인할 새도 없이 화면에서 밀려나고, 다음에 무엇을 할지도 알 수 없었다.
  // 자동 이동을 없애고 진행 결과와 다음 행동을 직접 고르게 한다.
  //
  // 이 화면은 인플루언서 전용이다(안내 문구와 이동 링크가 인플루언서 경로를 가리킨다).
  // 두 조건 모두 hostStaysConnected일 때만 참이 되므로 팬 화면에는 나타나지 않는다.
  // allCallsFinished는 조건에 직접 포함하고, meetingClosed는 이를 검사하는 loadMeetingStatus가
  // 호스트가 아니면 곧바로 반환하므로 팬 세션에서는 설정되지 않는다.
  //
  // 마지막 팬까지 만난 경우에는 곧바로 바꾸지 않고 마무리 버튼을 누를 때까지 통화 화면을 둔다.
  // 옆 패널에서 마지막 팬의 메모를 저장할 시간이 필요하기 때문이다. 반면 운영자가 팬미팅 자체를
  // 끝내거나 취소한 경우(meetingClosed)에는 통화 화면을 유지할 근거가 없어 그대로 넘어간다.
  if (meetingClosed || (allCallsFinished && wrapUpConfirmed)) {
    return (
      <MeetingWrapUp
        meetingId={props.meetingId}
        // 팬미팅 자체가 끝난 경우와 남은 팬이 없어 끝난 경우는 문구가 다르다.
        reason={meetingClosed ?? 'ALL_CALLS_FINISHED'}
        tally={finishedTally}
      />
    )
  }

  if (!connectionInfo || !sessionStatus) {
    return (
      <div className="mx-auto grid max-w-3xl gap-6 py-10">
        <header>
          <Badge variant="primary">{props.screenId}</Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">
            {t('videoCallRoom.t1')}
          </h1>
          <p className="mt-3 text-[var(--color-text-secondary)]">
            {t('videoCallRoom.t2')} <span className="font-mono">{props.callSessionId ?? t('videoCallRoom.t10')}</span>
          </p>
        </header>
        <AlertBanner
          title={loading ? t('videoCallRoom.t11') : t('videoCallRoom.t12')}
          variant={loading ? 'info' : 'error'}
        >
          {loading
            ? t('videoCallRoom.t13')
            : connectionError}
        </AlertBanner>
        {!loading ? (
          <div>
            <Button onClick={() => setRetryCount((count) => count + 1)}>{t('videoCallRoom.t3')}</Button>
          </div>
        ) : null}
      </div>
    )
  }

  const cameraId = window.sessionStorage.getItem('melly-camera-id') || undefined
  const microphoneId = window.sessionStorage.getItem('melly-microphone-id') || undefined

  return (
    <LiveKitRoom
      // 이전에 고른 장치가 분리됐어도 브라우저 기본 장치로 대체할 수 있게 ideal을 사용한다.
      audio={microphoneId ? { deviceId: { ideal: microphoneId } } : true}
      connect
      onError={(error) => setConnectionError(error.message)}
      onMediaDeviceFailure={() => {
        setConnectionError(
          t('videoCallRoom.t14'),
        )
      }}
      serverUrl={connectionInfo.liveKitUrl}
      token={connectionInfo.accessToken}
      video={cameraId ? { deviceId: { ideal: cameraId } } : true}
    >
      <ConnectedCallRoom
        {...props}
        callDurationSec={callDurationSec}
        // 종료·남은 시간·요약이 모두 진행 중인 세션을 따라야 하므로 주소 값이 아닌 활성 세션을 넘긴다.
        callSessionId={activeCallSessionId}
        onPeerCallEnded={handlePeerCallEnded}
        onReconnectNeeded={handleReconnectNeeded}
        recordingEnabled={recordingEnabled}
        recordingPolicyError={recordingPolicyError}
        sessionStatus={sessionStatus}
      />
      {/*
        마지막 팬까지 만난 뒤의 마무리 안내다.
        통화 화면은 뷰포트를 가득 채우므로 아래에 이어 붙이면 스크롤해야 보인다. 화면 아래에
        고정해 메모를 저장한 다음 바로 누를 수 있게 한다.
      */}
      {allCallsFinished ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[var(--color-surface-dark-panel)] px-4 py-3 sm:px-6 lg:px-10">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-extrabold text-white">{t('videoCallRoom.s1WrapTitle')}</p>
              <p className="mt-0.5 text-sm font-medium leading-[1.5] text-white/70">
                {t('videoCallRoom.s1WrapDesc')}
              </p>
            </div>
            <Button onClick={() => setWrapUpConfirmed(true)}>{t('videoCallRoom.s1WrapAction')}</Button>
          </div>
        </div>
      ) : null}
      {connectionError ? (
        <div className="mt-4">
          <AlertBanner title={t('videoCallRoom.t4')} variant="error">
            {connectionError}
          </AlertBanner>
        </div>
      ) : null}
      {statusError ? (
        <div className="mt-4">
          <AlertBanner title={t('videoCallRoom.t5')} variant="warning">
            {statusError}
          </AlertBanner>
        </div>
      ) : null}
    </LiveKitRoom>
  )
}
