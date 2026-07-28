import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useConnectionState,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useTracks,
} from '@livekit/components-react'
import { ConnectionState, Track } from 'livekit-client'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  getLiveKitConnectionInfo,
  type LiveKitConnectionInfo,
} from '../../api/livekit'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '../data-display/DataDisplay'
import { AlertBanner, Dialog } from '../feedback'
import { Button } from '../ui/Button'

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

function ConnectedCallRoom({
  screenId,
  meetingId,
  participantLabel,
  endTo,
}: VideoCallRoomProps) {
  const navigate = useNavigate()
  const room = useRoomContext()
  const connectionState = useConnectionState()
  const participants = useParticipants()
  const cameraTracks = useTracks([Track.Source.Camera])
  const {
    isCameraEnabled,
    isMicrophoneEnabled,
    localParticipant,
  } = useLocalParticipant()
  const [endDialogOpen, setEndDialogOpen] = useState(false)
  const [mediaAction, setMediaAction] = useState<'camera' | 'microphone'>()
  const [mediaError, setMediaError] = useState<string>()
  const isConnected = connectionState === ConnectionState.Connected
  const isReconnecting =
    connectionState === ConnectionState.Reconnecting ||
    connectionState === ConnectionState.SignalReconnecting
  const sessionDuration = useSessionDuration(isConnected)
  const remoteParticipants = participants.filter((participant) => !participant.isLocal)
  const remoteCameraTrack = cameraTracks.find((track) => !track.participant.isLocal)
  const localCameraTrack = cameraTracks.find((track) => track.participant.isLocal)

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

  let noticeTitle = 'LiveKit 통화방 연결 중'
  let noticeMessage = '보안 연결을 만들고 카메라와 마이크를 준비하고 있습니다.'
  let noticeVariant: 'info' | 'warning' | 'success' | 'error' = 'info'

  if (isConnected && remoteParticipants.length > 0) {
    noticeTitle = '영상통화 연결 완료'
    noticeMessage = '상대방과 LiveKit 통화방에 연결되었습니다.'
    noticeVariant = 'success'
  } else if (isConnected) {
    noticeTitle = '상대방 입장 대기 중'
    noticeMessage = '내 장비 연결은 완료되었습니다. 상대방이 같은 통화방에 입장하면 자동으로 표시됩니다.'
    noticeVariant = 'info'
  } else if (isReconnecting) {
    noticeTitle = '통화 재연결 중'
    noticeMessage = '네트워크 연결이 불안정해 LiveKit 통화방에 다시 연결하고 있습니다.'
    noticeVariant = 'warning'
  } else if (connectionState === ConnectionState.Disconnected) {
    noticeTitle = '통화 연결이 종료되었습니다'
    noticeMessage = '다시 입장하려면 페이지를 새로고침해 주세요.'
    noticeVariant = 'error'
  }

  return (
    <div className="grid gap-6">
      <RoomAudioRenderer />

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant="primary">{screenId}</Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-tight !text-slate-950">영상 통화</h1>
          <p className="mt-3 text-slate-600">
            팬미팅 ID: <span className="font-mono text-slate-800">{meetingId}</span>
          </p>
        </div>
        <Badge variant={isConnected ? 'success' : 'neutral'}>
          {isConnected ? `세션 ${sessionDuration}` : '연결 중'}
        </Badge>
      </header>

      <AlertBanner title={noticeTitle} variant={noticeVariant}>
        {noticeMessage}
      </AlertBanner>

      {mediaError ? (
        <AlertBanner title="장비 상태를 변경하지 못했습니다" variant="error">
          {mediaError}
        </AlertBanner>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.8fr)]">
        <Card className="overflow-hidden bg-slate-950">
          <div className="relative aspect-video">
            {remoteCameraTrack ? (
              <VideoTrack
                aria-label={participantLabel}
                className="size-full object-cover"
                trackRef={remoteCameraTrack}
              />
            ) : (
              <div
                aria-label={`${participantLabel} 영역`}
                className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center text-slate-300"
              >
                <span aria-hidden="true" className="text-5xl">◎</span>
                <div>
                  <p className="font-semibold text-white">{participantLabel}</p>
                  <p className="mt-2 text-sm leading-6">
                    상대방의 입장 또는 카메라 연결을 기다리고 있습니다.
                  </p>
                </div>
                <Badge className="bg-white/10 text-white">LiveKit 연결 대기</Badge>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>내 화면</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-950">
              {localCameraTrack && isCameraEnabled ? (
                <VideoTrack
                  aria-label="내 카메라"
                  className="size-full -scale-x-100 object-cover"
                  trackRef={localCameraTrack}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-slate-300">
                  카메라가 꺼져 있습니다.
                </div>
              )}
            </div>
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">카메라</dt>
                <dd className={isCameraEnabled ? 'font-semibold text-emerald-700' : 'text-slate-500'}>
                  {isCameraEnabled ? '켜짐' : '꺼짐'}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">마이크</dt>
                <dd className={isMicrophoneEnabled ? 'font-semibold text-emerald-700' : 'text-slate-500'}>
                  {isMicrophoneEnabled ? '켜짐' : '꺼짐'}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-center gap-3">
          <Button
            disabled={!isConnected}
            loading={mediaAction === 'camera'}
            onClick={() => void toggleCamera()}
            variant={isCameraEnabled ? 'secondary' : 'outline'}
          >
            {isCameraEnabled ? '카메라 끄기' : '카메라 켜기'}
          </Button>
          <Button
            disabled={!isConnected}
            loading={mediaAction === 'microphone'}
            onClick={() => void toggleMicrophone()}
            variant={isMicrophoneEnabled ? 'secondary' : 'outline'}
          >
            {isMicrophoneEnabled ? '마이크 끄기' : '마이크 켜기'}
          </Button>
          <Link
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
            to={`/fan-meetings/${meetingId}/device-check`}
          >
            장비 다시 선택
          </Link>
          <Button onClick={() => setEndDialogOpen(true)} variant="danger">
            통화 종료
          </Button>
        </CardContent>
      </Card>

      <Dialog
        description="LiveKit 통화방 연결을 종료하고 다음 화면으로 이동합니다."
        footer={
          <>
            <Button onClick={() => setEndDialogOpen(false)} variant="ghost">
              계속 통화
            </Button>
            <Button onClick={() => void leaveRoom()} variant="danger">
              종료하기
            </Button>
          </>
        }
        onOpenChange={setEndDialogOpen}
        open={endDialogOpen}
        title="영상 통화를 종료할까요?"
      >
        <p className="text-sm leading-6 text-slate-600">
          연결을 종료하면 LiveKit이 사용 중인 카메라와 마이크도 함께 정리합니다.
        </p>
      </Dialog>
    </div>
  )
}

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
          error instanceof Error ? error.message : 'LiveKit 통화 연결 정보를 가져오지 못했습니다.',
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
        <header>
          <Badge variant="primary">{props.screenId}</Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-tight !text-slate-950">영상 통화</h1>
          <p className="mt-3 text-slate-600">
            팬미팅 ID: <span className="font-mono text-slate-800">{props.meetingId}</span>
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
      <ConnectedCallRoom
        {...props}
      />
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
