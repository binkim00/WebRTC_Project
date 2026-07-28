import {
  LiveKitRoom,
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
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  getLiveKitConnectionInfo,
  type LiveKitConnectionInfo,
} from '../../api/livekit'
import localPreviewImage from '../../assets/call-preview-local.jpg'
import remotePreviewImage from '../../assets/call-preview-remote.jpg'
import { Badge } from '../data-display/DataDisplay'
import { AlertBanner, Dialog } from '../feedback/Feedback'
import { Button } from '../ui/Button'
import { CallStage } from './CallStage'

export type VideoCallRoomProps = {
  screenId: string
  meetingId: string
  participantLabel: string
  endTo: string
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function useSessionDuration(active: boolean) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (!active) {
      setSeconds(0)
      return
    }

    const intervalId = window.setInterval(() => {
      setSeconds((current) => current + 1)
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [active])

  return formatDuration(seconds)
}

type EndCallDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

function EndCallDialog({ open, onOpenChange, onConfirm }: EndCallDialogProps) {
  return (
    <Dialog
      description="LiveKit 통화방 연결을 종료하고 다음 화면으로 이동합니다."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            계속 통화
          </Button>
          <Button onClick={onConfirm} variant="danger">
            종료하기
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      title="영상 통화를 종료할까요?"
    >
      <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
        연결을 종료하면 LiveKit이 사용 중인 카메라와 마이크도 함께 정리합니다.
      </p>
    </Dialog>
  )
}

function ConnectedCallRoom({
  meetingId,
  participantLabel,
  endTo,
}: VideoCallRoomProps) {
  const navigate = useNavigate()
  const room = useRoomContext()
  const connectionState = useConnectionState()
  const participants = useParticipants()
  const cameraTracks = useTracks([Track.Source.Camera])
  const transcriptions = useTranscriptions()
  const {
    isCameraEnabled,
    isMicrophoneEnabled,
    localParticipant,
  } = useLocalParticipant()
  const [endDialogOpen, setEndDialogOpen] = useState(false)
  const [captionEnabled, setCaptionEnabled] = useState(true)
  const [mediaAction, setMediaAction] = useState<'camera' | 'microphone'>()
  const [mediaError, setMediaError] = useState<string>()
  const isConnected = connectionState === ConnectionState.Connected
  const isReconnecting =
    connectionState === ConnectionState.Reconnecting ||
    connectionState === ConnectionState.SignalReconnecting
  const sessionDuration = useSessionDuration(isConnected)
  const remoteParticipants = participants.filter((participant) => !participant.isLocal)
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
    await room.disconnect()
    navigate(endTo)
  }

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
        timeLabel="진행 시간"
        timeValue={sessionDuration}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--color-text-secondary)]">
        <p>
          팬미팅 ID: <span className="font-mono text-[var(--color-text-primary)]">{meetingId}</span>
        </p>
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

function PreviewCallRoom({ endTo, participantLabel }: VideoCallRoomProps) {
  const navigate = useNavigate()
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true)
  const [captionEnabled, setCaptionEnabled] = useState(true)
  const [endDialogOpen, setEndDialogOpen] = useState(false)

  const remoteVideo = (
    <img
      alt={`${participantLabel} 디자인 미리보기`}
      className="size-full object-cover"
      src={remotePreviewImage}
    />
  )

  const localVideo = cameraEnabled ? (
    <img
      alt="내 카메라 디자인 미리보기"
      className="size-full -scale-x-100 object-cover"
      src={localPreviewImage}
    />
  ) : (
    <div className="flex size-full items-center justify-center bg-[#23242a] text-white/70">
      <UserCircleIcon aria-hidden="true" size={48} weight="thin" />
    </div>
  )

  return (
    <div className="grid gap-4">
      <CallStage
        cameraEnabled={cameraEnabled}
        captionEnabled={captionEnabled}
        captionSpeaker="Melly"
        captionText="오늘 만나게 돼서 정말 반가워요!"
        connected
        connectionLabel="연결 완료"
        localVideo={localVideo}
        microphoneEnabled={microphoneEnabled}
        onCameraToggle={() => setCameraEnabled((enabled) => !enabled)}
        onCaptionToggle={() => setCaptionEnabled((enabled) => !enabled)}
        onLeave={() => setEndDialogOpen(true)}
        onMicrophoneToggle={() => setMicrophoneEnabled((enabled) => !enabled)}
        participantLabel={participantLabel}
        remoteVideo={remoteVideo}
        timeLabel="남은 시간"
        timeValue="00:30"
      />

      <EndCallDialog
        onConfirm={() => navigate(endTo)}
        onOpenChange={setEndDialogOpen}
        open={endDialogOpen}
      />
    </div>
  )
}

export function VideoCallRoom(props: VideoCallRoomProps) {
  const [searchParams] = useSearchParams()
  const isDesignPreview = import.meta.env.DEV && searchParams.get('preview') === '1'
  const [connectionInfo, setConnectionInfo] = useState<LiveKitConnectionInfo>()
  const [connectionError, setConnectionError] = useState<string>()
  const [retryCount, setRetryCount] = useState(0)
  const [loading, setLoading] = useState(!isDesignPreview)

  const loadConnectionInfo = useCallback(
    async (signal: AbortSignal) => {
      if (isDesignPreview) {
        return
      }

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
          error instanceof Error ? error.message : 'LiveKit 통화 연결 정보를 가져오지 못했습니다.',
        )
      } finally {
        if (!signal.aborted) {
          setLoading(false)
        }
      }
    },
    [isDesignPreview, props.meetingId],
  )

  useEffect(() => {
    const abortController = new AbortController()
    void loadConnectionInfo(abortController.signal)
    return () => abortController.abort()
  }, [loadConnectionInfo, retryCount])

  if (isDesignPreview) {
    return <PreviewCallRoom {...props} />
  }

  if (!connectionInfo) {
    return (
      <div className="mx-auto grid max-w-3xl gap-6 py-10">
        <header>
          <Badge variant="primary">{props.screenId}</Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">
            영상 통화
          </h1>
          <p className="mt-3 text-[var(--color-text-secondary)]">
            팬미팅 ID: <span className="font-mono">{props.meetingId}</span>
          </p>
        </header>
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
        setConnectionError('카메라 또는 마이크를 사용할 수 없습니다. 브라우저 권한과 장치 연결을 확인해 주세요.')
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
