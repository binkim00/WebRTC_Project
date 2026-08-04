import {
  RoomAudioRenderer,
  VideoTrack,
  useConnectionState,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useTracks,
  useTranscriptions,
} from '@livekit/components-react'
import { UserCircleIcon } from '@phosphor-icons/react'
import { ConnectionState, Track } from 'livekit-client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useNavigate } from 'react-router-dom'
import {
  endCallSessionByFan,
  forceEndCallSession,
  getCallSessionStatus,
  type CallSessionStatusResponse,
} from '../../api/callSessions'
import { getAuthSession } from '../../api/auth'
import { useCallRecording } from '../../hooks/useCallRecording'
import { AlertBanner } from '../feedback'
import { CallStage } from './CallStage'
import { logCallConnectionState } from './connectionDebug'
import { EndCallDialog } from './EndCallDialog'
import type { MediaAction, VideoCallRoomProps } from './types'
import { useRemainingTime } from './useRemainingTime'

type ConnectedCallRoomProps = VideoCallRoomProps & {
  sessionStatus: CallSessionStatusResponse
  recordingEnabled: boolean
  recordingPolicyError?: string
  /** 팬미팅 운영 설정의 1인당 통화 시간(초)이며 상세를 못 읽었으면 undefined다. */
  callDurationSec?: number
  /**
   * 의도치 않게 연결이 끊겨 새 토큰으로 다시 입장해야 할 때 호출한다.
   *
   * 호스트는 팬미팅 내내 한 토큰으로 머무는데 LiveKit 토큰 TTL은 15분이다.
   * 긴 팬미팅에서 연결이 끊기면 만료된 토큰으로는 재입장할 수 없어 재발급이 필요하다.
   */
  onReconnectNeeded?: () => void
}

export function ConnectedCallRoom({
  meetingId,
  callSessionId,
    participantLabel,
    endTo,
    sessionStatus,
    forceEndOnLeave,
    recordingEnabled,
    recordingPolicyError,
    callDurationSec,
    hostStaysConnected,
    onReconnectNeeded,
}: ConnectedCallRoomProps) {
  const navigate = useNavigate()
  const room = useRoomContext()
  const connectionState = useConnectionState()
  const participants = useParticipants()
  const cameraTracks = useTracks([Track.Source.Camera])
  const microphoneTracks = useTracks([Track.Source.Microphone])
  const transcriptions = useTranscriptions()
  const { isCameraEnabled, isMicrophoneEnabled, localParticipant } = useLocalParticipant()
  const [endDialogOpen, setEndDialogOpen] = useState(false)
  const [captionEnabled, setCaptionEnabled] = useState(true)
  const [mediaAction, setMediaAction] = useState<MediaAction>()
  const [mediaError, setMediaError] = useState<string>()
  const [departurePending, setDeparturePending] = useState(false)
  // 자동 종료가 폴링·틱마다 반복 실행되지 않도록 한 번만 통과시킨다.
  const autoEndStartedRef = useRef(false)
  // 한 번이라도 연결된 뒤에 끊긴 경우만 재입장 대상으로 본다. 최초 연결 전 Disconnected와 구분한다.
  const wasConnectedRef = useRef(false)
  // 우리가 의도적으로 방을 떠나는 중이면 재입장하지 않는다.
  const leavingRef = useRef(false)
  const isConnected = connectionState === ConnectionState.Connected
  const isReconnecting =
    connectionState === ConnectionState.Reconnecting ||
    connectionState === ConnectionState.SignalReconnecting
  const remaining = useRemainingTime(sessionStatus, callDurationSec)
  const remoteParticipants = participants.filter((participant) => !participant.isLocal)
  // 배열은 렌더링마다 새로 만들어지므로 useEffect 의존성으로는 직렬화한 문자열을 사용한다.
  const remoteIdentityKey = JSON.stringify(
    remoteParticipants.map((participant) => participant.identity),
  )
  const remoteParticipant = remoteParticipants[0]
  const remoteCameraTrack = cameraTracks.find((track) => !track.participant.isLocal)
  const localCameraTrack = cameraTracks.find((track) => track.participant.isLocal)
  const remoteMicrophoneTrack = microphoneTracks.find((track) => !track.participant.isLocal)
  const localMicrophoneTrack = microphoneTracks.find((track) => track.participant.isLocal)
  const remoteName =
    remoteParticipant?.name ||
    remoteParticipant?.identity ||
    participantLabel.replace(/\s*영상$/, '')

  /**
   * 자막 스트림을 화자 이름이 붙은 최근 대사 목록으로 만든다.
   *
   * LiveKit은 같은 발화를 갱신하며 여러 번 보내므로 스트림 식별자로 마지막 값만 남긴다.
   * 마지막 한 줄만 쓰면 이전 대사가 즉시 사라져 읽을 시간이 없으므로 최근 세 줄을 유지한다.
   */
  const captionLines = useMemo(() => {
    const byStream = new Map<string, { speaker: string; text: string }>()
    for (const transcription of transcriptions) {
      const text = transcription.text.trim()
      if (!text) continue

      const { identity } = transcription.participantInfo
      const speaker =
        identity === localParticipant.identity
          ? '나'
          : participants.find((participant) => participant.identity === identity)?.name
            || remoteName
      byStream.set(transcription.streamInfo.id, { speaker, text })
    }

    return [...byStream.values()].slice(-3)
  }, [localParticipant.identity, participants, remoteName, transcriptions])

  // 백엔드 업로드 권한(FAN)과 팬미팅의 실제 녹화 설정이 모두 맞을 때만 녹화한다.
  const [authSession] = useState(() => getAuthSession())
  const serverEgressEnabled = import.meta.env.VITE_RECORDING_EGRESS_ENABLED === 'true'
  const {
    stopAndUpload,
    retryUpload,
    recordingState,
    recordingError,
    hasPendingRecording,
    pendingRecordingPersisted,
  } = useCallRecording({
    enabled:
      !serverEgressEnabled &&
      authSession?.role === 'FAN' &&
      recordingEnabled &&
      isConnected,
    meetingId,
    callSessionId,
    authToken: authSession?.accessToken,
    remoteVideoTrack: remoteCameraTrack?.publication?.track?.mediaStreamTrack,
    remoteAudioTrack: remoteMicrophoneTrack?.publication?.track?.mediaStreamTrack,
    localAudioTrack: localMicrophoneTrack?.publication?.track?.mediaStreamTrack,
  })

  async function toggleCamera() {
    setMediaAction('camera')
    setMediaError(undefined)

    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled)
    } catch (error: unknown) {
      setMediaError(error instanceof Error ? error.message : '카메라 상태를 변경하지 못했습니다.')
    } finally {
      setMediaAction(undefined)
    }
  }

  async function toggleMicrophone() {
    setMediaAction('microphone')
    setMediaError(undefined)

    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)
    } catch (error: unknown) {
      setMediaError(error instanceof Error ? error.message : '마이크 상태를 변경하지 못했습니다.')
    } finally {
      setMediaAction(undefined)
    }
  }

  /**
   * 녹화를 마무리하고 Room에서 나간 뒤 종료 화면으로 이동한다.
   *
   * @param notifyServer 서버 세션도 함께 종료할지 여부이며, 제한 시간이 지나 서버가 이미
   *   TIMEOUT으로 마감하는 경우에는 false로 넘겨 종료 사유를 덮어쓰지 않는다.
   */
  const finishCall = useCallback(
    async (notifyServer: boolean) => {
      // 녹화 업로드가 실패하면 파일을 보존한 채 이 화면에서 즉시 재시도할 수 있게 한다.
      const recordingSaved = await stopAndUpload()

      if (notifyServer && callSessionId && (forceEndOnLeave || authSession?.role === 'FAN')) {
        const authToken = authSession?.accessToken
        try {
          if (authSession?.role === 'FAN') {
            // FAN 전용 정상 종료 API를 연결해 LiveKit 연결뿐 아니라 서버 세션도 즉시 종료한다.
            await endCallSessionByFan(callSessionId, { authToken })
          } else {
            await forceEndCallSession(
              callSessionId,
              { reason: '영상통화 종료' },
              { authToken },
            )
          }
        } catch (error: unknown) {
          // 다른 경로에서 이미 종료된 경우에는 성공으로 간주하고, 그 외 실패는 화면에 남아 재시도하게 한다.
          const latestStatus = await getCallSessionStatus(callSessionId, { authToken })
            .catch(() => undefined)
          if (latestStatus?.status !== 'ENDED') {
            setMediaError(
              error instanceof Error
                ? error.message
                : '통화 종료 상태를 서버에 반영하지 못했습니다.',
            )
            return
          }
        }
      }

      // 호스트는 팬미팅 내내 같은 방을 쓴다. 통화만 끝내고 방에 머물러 다음 팬을 기다린다.
      // 상태 폴링이 ENDED를 확인하면 화면이 대기 상태로 바뀐다.
      if (hostStaysConnected) return

      await room.disconnect()
      if (!recordingSaved) {
        setDeparturePending(true)
        return
      }
      navigate(endTo)
    },
    [
      authSession,
      callSessionId,
      endTo,
      forceEndOnLeave,
      hostStaysConnected,
      navigate,
      room,
      stopAndUpload,
    ],
  )

  /**
   * 방을 완전히 떠난다.
   *
   * 호스트는 통화 종료(finishCall)와 팬미팅 진행 종료를 구분해야 하므로 별도 경로로 둔다.
   */
  const leaveRoom = useCallback(async () => {
    leavingRef.current = true
    await room.disconnect()
    navigate(endTo)
  }, [endTo, navigate, room])

  async function handleRecordingRetry() {
    const uploaded = await retryUpload()
    if (uploaded && departurePending) navigate(endTo)
  }

  useEffect(() => {
    // 카운트다운이 0이 되면 팬은 더 이상 통화할 수 없으므로 바로 통화를 마무리한다.
    // 서버 스케줄러가 1초 주기로 같은 세션을 TIMEOUT으로 마감하므로 종료 API는 호출하지 않고,
    // 종료 사유를 NORMAL로 덮어쓰지 않은 채 화면만 먼저 정리한다.
    if (!remaining.expired || sessionStatus.status !== 'ACTIVE') return
    if (authSession?.role !== 'FAN') return
    if (autoEndStartedRef.current) return

    autoEndStartedRef.current = true
    void finishCall(false)
  }, [authSession?.role, finishCall, remaining.expired, sessionStatus.status])

  function continueWithPendingRecording() {
    // IndexedDB에 보관한 세션 ID를 완료 화면에 전달해 그곳에서도 재시도할 수 있게 한다.
    navigate(endTo, {
      state: hasPendingRecording && pendingRecordingPersisted && callSessionId
        ? { pendingRecordingSessionId: callSessionId }
        : undefined,
    })
  }

  // 상태나 참가자 구성이 바뀔 때만 기록해, 렌더링마다 로그가 쌓이지 않게 한다.
  useEffect(() => {
    logCallConnectionState({
      callSessionId,
      connectionState,
      remoteIdentities: JSON.parse(remoteIdentityKey) as string[],
    })
  }, [callSessionId, connectionState, remoteIdentityKey])

  useEffect(() => {
    if (sessionStatus.status !== 'ENDED') {
      return
    }

    // 호스트는 팬이 교체될 때마다 세션이 ENDED가 된다. 여기서 방을 나가고 화면을 이탈하면
    // 차례가 넘어갈 때마다 통화 화면에서 튕겨 나가므로, 방을 유지한 채 다음 팬을 기다린다.
    if (hostStaysConnected) {
      return
    }

    void stopAndUpload().then(async (recordingSaved) => {
      await room.disconnect()
      if (recordingSaved) {
        navigate(endTo, { replace: true })
      } else {
        setDeparturePending(true)
      }
    })
  }, [endTo, hostStaysConnected, navigate, room, sessionStatus.status, stopAndUpload])

  useEffect(() => {
    if (isConnected) wasConnectedRef.current = true
  }, [isConnected])

  useEffect(() => {
    if (!hostStaysConnected || !onReconnectNeeded) return
    if (connectionState !== ConnectionState.Disconnected) return
    // 최초 연결 전이거나 우리가 나가는 중이면 재입장 대상이 아니다.
    if (!wasConnectedRef.current || leavingRef.current) return

    // 토큰 TTL(15분)이 지나면 기존 토큰으로는 다시 못 붙으므로 새로 발급받아 재입장한다.
    wasConnectedRef.current = false
    onReconnectNeeded()
  }, [connectionState, hostStaysConnected, onReconnectNeeded])

  /** 호스트가 방에 머문 채 다음 팬 배정을 기다리는 상태다. */
  const waitingForNextFan = Boolean(hostStaysConnected) && sessionStatus.status === 'ENDED'

  let connectionLabel = '연결 중'

  if (waitingForNextFan) {
    connectionLabel = '다음 팬 대기 중'
  } else if (isConnected && remoteParticipants.length > 0) {
    connectionLabel = '연결 완료'
  } else if (isConnected) {
    connectionLabel = '입장 대기'
  } else if (isReconnecting) {
    connectionLabel = '재연결 중'
  } else if (connectionState === ConnectionState.Disconnected) {
    connectionLabel = '연결 종료'
  }

  const remoteVideo = remoteCameraTrack ? (
    <VideoTrack
      aria-label={participantLabel}
      className="size-full object-cover"
      trackRef={remoteCameraTrack}
    />
  ) : (
    <div className="flex size-full flex-col items-center justify-center gap-3 bg-[#23242a] px-6 text-center text-white/70">
      <UserCircleIcon aria-hidden="true" size={64} weight="thin" />
      <p className="font-semibold text-white">{remoteName}</p>
      <p className="text-sm">상대방의 입장 또는 카메라 연결을 기다리고 있습니다.</p>
    </div>
  )

  const localVideo =
    localCameraTrack && isCameraEnabled ? (
      <VideoTrack
        aria-label="내 카메라"
        className="size-full -scale-x-100 object-cover"
        trackRef={localCameraTrack}
      />
    ) : (
      <div className="flex size-full items-center justify-center bg-[#23242a] text-white/70">
        <UserCircleIcon aria-hidden="true" size={48} weight="thin" />
      </div>
    )

  return (
    <div className="grid gap-4">
      <RoomAudioRenderer />
      <CallStage
        cameraEnabled={isCameraEnabled}
        captionEnabled={captionEnabled}
        captionLines={captionLines}
        connected={isConnected}
        connectionLabel={connectionLabel}
        localVideo={localVideo}
        mediaAction={mediaAction}
        microphoneEnabled={isMicrophoneEnabled}
        onCameraToggle={() => void toggleCamera()}
        onCaptionToggle={() => setCaptionEnabled((enabled) => !enabled)}
        onLeave={() => setEndDialogOpen(true)}
        onMicrophoneToggle={() => void toggleMicrophone()}
        participantLabel={participantLabel}
        remoteVideo={remoteVideo}
        // 통화 시작 전에는 아직 줄어들 남은 시간이 없으므로 설정된 통화 시간임을 밝힌다.
        timeLabel={remaining.counting ? '남은 시간' : '통화 시간'}
        timeValue={remaining.label}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--color-text-secondary)]">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <p>
            팬미팅 ID:{' '}
            <span className="font-mono text-[var(--color-text-primary)]">{meetingId}</span>
          </p>
          <p>
            통화 세션 ID:{' '}
            <span className="font-mono text-[var(--color-text-primary)]">{callSessionId}</span>
          </p>
        </div>
        <p>
          {captionLines.length
            ? '실시간 자막을 표시하고 있습니다.'
            : '실시간 자막은 자막 AI가 Room에 참여하면 표시됩니다.'}
        </p>
      </div>

      {waitingForNextFan ? (
        <AlertBanner title="다음 팬을 기다리고 있습니다" variant="info">
          통화방 연결은 그대로 유지됩니다. 운영 화면에서 다음 팬을 호출하면 이 화면에서
          바로 이어서 통화할 수 있습니다.
        </AlertBanner>
      ) : null}

      {mediaError ? (
        <AlertBanner title="장비 상태를 변경하지 못했습니다" variant="error">
          {mediaError}
        </AlertBanner>
      ) : null}

      {authSession?.role === 'FAN' && recordingPolicyError ? (
        <AlertBanner title="녹화 설정 확인 실패" variant="warning">
          {recordingPolicyError}
        </AlertBanner>
      ) : null}

      {authSession?.role === 'FAN' && !recordingPolicyError && !recordingEnabled ? (
        <AlertBanner title="녹화하지 않는 팬미팅" variant="info">
          이 통화는 팬미팅 운영 설정에 따라 녹화되지 않습니다.
        </AlertBanner>
      ) : null}

      {authSession?.role === 'FAN' && recordingEnabled && serverEgressEnabled ? (
        <AlertBanner title="서버 녹화 중" variant="info">
          LiveKit Egress가 통화 영상을 서버에서 녹화하고 있습니다.
        </AlertBanner>
      ) : null}

      {authSession?.role === 'FAN' && recordingEnabled && !serverEgressEnabled
        && recordingState === 'recording' ? (
        <AlertBanner title="통화 녹화 중" variant="info">
          팬미팅 설정에 따라 이 통화가 녹화되고 있습니다.
        </AlertBanner>
      ) : null}

      {authSession?.role === 'FAN' && recordingEnabled && !serverEgressEnabled
        && recordingState === 'uploading' ? (
        <AlertBanner title="녹화 영상 저장 중" variant="info">
          업로드가 끝날 때까지 이 화면을 닫지 말아 주세요.
        </AlertBanner>
      ) : null}

      {authSession?.role === 'FAN' && recordingEnabled && !serverEgressEnabled
        && recordingState === 'failed' ? (
        <AlertBanner title="녹화 영상을 아직 저장하지 못했습니다" variant="error">
          <p>{recordingError ?? '브라우저에 임시 보관했으며 다시 업로드할 수 있습니다.'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded-[var(--radius-control)] border border-current px-3 py-2 font-semibold"
              onClick={() => void handleRecordingRetry()}
              type="button"
            >
              업로드 다시 시도
            </button>
            {departurePending && pendingRecordingPersisted ? (
              <button
                className="rounded-[var(--radius-control)] border border-current px-3 py-2 font-semibold"
                onClick={continueWithPendingRecording}
                type="button"
              >
                완료 화면에서 재시도
              </button>
            ) : null}
          </div>
        </AlertBanner>
      ) : null}

      <EndCallDialog
        onConfirm={() => {
          setEndDialogOpen(false)
          void finishCall(true)
        }}
        onLeaveRoom={hostStaysConnected ? () => void leaveRoom() : undefined}
        onOpenChange={setEndDialogOpen}
        open={endDialogOpen}
      />
    </div>
  )
}
