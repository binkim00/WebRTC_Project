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
import { useEffect, useState } from 'react'

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
import { EndCallDialog } from './EndCallDialog'
import type { MediaAction, VideoCallRoomProps } from './types'
import { useRemainingTime } from './useRemainingTime'

type ConnectedCallRoomProps = VideoCallRoomProps & {
  sessionStatus: CallSessionStatusResponse
  recordingEnabled: boolean
  recordingPolicyError?: string
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
  const isConnected = connectionState === ConnectionState.Connected
  const isReconnecting =
    connectionState === ConnectionState.Reconnecting ||
    connectionState === ConnectionState.SignalReconnecting
  const remainingTime = useRemainingTime(sessionStatus)
  const remoteParticipants = participants.filter((participant) => !participant.isLocal)
  const remoteParticipant = remoteParticipants[0]
  const remoteCameraTrack = cameraTracks.find((track) => !track.participant.isLocal)
  const localCameraTrack = cameraTracks.find((track) => track.participant.isLocal)
  const remoteMicrophoneTrack = microphoneTracks.find((track) => !track.participant.isLocal)
  const localMicrophoneTrack = microphoneTracks.find((track) => track.participant.isLocal)
  const latestTranscription = transcriptions.at(-1)
  const remoteName =
    remoteParticipant?.name ||
    remoteParticipant?.identity ||
    participantLabel.replace(/\s*영상$/, '')

  // 백엔드 업로드 권한(FAN)과 팬미팅의 실제 녹화 설정이 모두 맞을 때만 녹화한다.
  const [authSession] = useState(() => getAuthSession())
  const {
    stopAndUpload,
    retryUpload,
    recordingState,
    recordingError,
    hasPendingRecording,
    pendingRecordingPersisted,
  } = useCallRecording({
    enabled: authSession?.role === 'FAN' && recordingEnabled && isConnected,
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

  async function leaveRoom() {
    // 녹화 업로드가 실패하면 파일을 보존한 채 이 화면에서 즉시 재시도할 수 있게 한다.
    const recordingSaved = await stopAndUpload()

    if (callSessionId && (forceEndOnLeave || authSession?.role === 'FAN')) {
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

    await room.disconnect()
    if (!recordingSaved) {
      setDeparturePending(true)
      return
    }
    navigate(endTo)
  }

  async function handleRecordingRetry() {
    const uploaded = await retryUpload()
    if (uploaded && departurePending) navigate(endTo)
  }

  function continueWithPendingRecording() {
    // IndexedDB에 보관한 세션 ID를 완료 화면에 전달해 그곳에서도 재시도할 수 있게 한다.
    navigate(endTo, {
      state: hasPendingRecording && pendingRecordingPersisted && callSessionId
        ? { pendingRecordingSessionId: callSessionId }
        : undefined,
    })
  }

  useEffect(() => {
    if (sessionStatus.status !== 'ENDED') {
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
  }, [endTo, navigate, room, sessionStatus.status, stopAndUpload])

  let connectionLabel = '연결 중'

  if (isConnected && remoteParticipants.length > 0) {
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
        captionSpeaker={latestTranscription ? remoteName : undefined}
        captionText={latestTranscription?.text}
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
        timeLabel="남은 시간"
        timeValue={remainingTime}
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
        <p>실시간 자막은 LiveKit transcription 데이터가 전달될 때 표시됩니다.</p>
      </div>

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

      {authSession?.role === 'FAN' && recordingEnabled && recordingState === 'recording' ? (
        <AlertBanner title="통화 녹화 중" variant="info">
          팬미팅 설정에 따라 이 통화가 녹화되고 있습니다.
        </AlertBanner>
      ) : null}

      {authSession?.role === 'FAN' && recordingEnabled && recordingState === 'uploading' ? (
        <AlertBanner title="녹화 영상 저장 중" variant="info">
          업로드가 끝날 때까지 이 화면을 닫지 말아 주세요.
        </AlertBanner>
      ) : null}

      {authSession?.role === 'FAN' && recordingEnabled && recordingState === 'failed' ? (
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
        onConfirm={() => void leaveRoom()}
        onOpenChange={setEndDialogOpen}
        open={endDialogOpen}
      />
    </div>
  )
}
