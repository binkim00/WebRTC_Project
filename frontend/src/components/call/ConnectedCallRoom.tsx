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
import { forceEndCallSession, type CallSessionStatusResponse } from '../../api/callSessions'
import { getAuthSession } from '../../api/auth'
import { AlertBanner } from '../feedback'
import { CallStage } from './CallStage'
import { logCallConnectionState } from './connectionDebug'
import { EndCallDialog } from './EndCallDialog'
import type { MediaAction, VideoCallRoomProps } from './types'
import { useRemainingTime } from './useRemainingTime'

type ConnectedCallRoomProps = VideoCallRoomProps & {
  sessionStatus: CallSessionStatusResponse
}

export function ConnectedCallRoom({
  meetingId,
  callSessionId,
    participantLabel,
    endTo,
    sessionStatus,
    forceEndOnLeave,
}: ConnectedCallRoomProps) {
  const navigate = useNavigate()
  const room = useRoomContext()
  const connectionState = useConnectionState()
  const participants = useParticipants()
  const cameraTracks = useTracks([Track.Source.Camera])
  const transcriptions = useTranscriptions()
  const { isCameraEnabled, isMicrophoneEnabled, localParticipant } = useLocalParticipant()
  const [endDialogOpen, setEndDialogOpen] = useState(false)
  const [captionEnabled, setCaptionEnabled] = useState(true)
  const [mediaAction, setMediaAction] = useState<MediaAction>()
  const [mediaError, setMediaError] = useState<string>()
  const isConnected = connectionState === ConnectionState.Connected
  const isReconnecting =
    connectionState === ConnectionState.Reconnecting ||
    connectionState === ConnectionState.SignalReconnecting
  const remainingTime = useRemainingTime(sessionStatus)
  const remoteParticipants = participants.filter((participant) => !participant.isLocal)
  // 배열은 렌더링마다 새로 만들어지므로 useEffect 의존성으로는 직렬화한 문자열을 사용한다.
  const remoteIdentityKey = JSON.stringify(
    remoteParticipants.map((participant) => participant.identity),
  )
  const remoteParticipant = remoteParticipants[0]
  const remoteCameraTrack = cameraTracks.find((track) => !track.participant.isLocal)
  const localCameraTrack = cameraTracks.find((track) => track.participant.isLocal)
  const latestTranscription = transcriptions.at(-1)
  const remoteName =
    remoteParticipant?.name ||
    remoteParticipant?.identity ||
    participantLabel.replace(/\s*영상$/, '')

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
    if (forceEndOnLeave && callSessionId) {
      try {
        await forceEndCallSession(callSessionId, { reason: '영상통화 종료' }, {
          authToken: getAuthSession()?.accessToken,
        })
      } catch (error: unknown) {
        setMediaError(error instanceof Error ? error.message : '통화 종료 상태를 서버에 반영하지 못했습니다.')
      }
    }

    await room.disconnect()
    navigate(endTo)
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

    void room.disconnect().finally(() => navigate(endTo, { replace: true }))
  }, [endTo, navigate, room, sessionStatus.status])

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

      <EndCallDialog
        onConfirm={() => void leaveRoom()}
        onOpenChange={setEndDialogOpen}
        open={endDialogOpen}
      />
    </div>
  )
}
