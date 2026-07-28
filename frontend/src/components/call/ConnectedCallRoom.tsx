import {
  RoomAudioRenderer,
  VideoTrack,
  useConnectionState,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useTracks,
} from '@livekit/components-react'
import { ConnectionState, Track } from 'livekit-client'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '../data-display'
import { AlertBanner, type FeedbackVariant } from '../feedback'
import { CallControls } from './CallControls'
import { CallRoomHeader } from './CallRoomHeader'
import { EndCallDialog } from './EndCallDialog'
import type { MediaAction, VideoCallRoomProps } from './types'
import { useSessionDuration } from './useSessionDuration'

export function ConnectedCallRoom({
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
  const { isCameraEnabled, isMicrophoneEnabled, localParticipant } = useLocalParticipant()
  const [endDialogOpen, setEndDialogOpen] = useState(false)
  const [mediaAction, setMediaAction] = useState<MediaAction>()
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
  let noticeVariant: FeedbackVariant = 'info'

  if (isConnected && remoteParticipants.length > 0) {
    noticeTitle = '영상통화 연결 완료'
    noticeMessage = '상대방과 LiveKit 통화방에 연결되었습니다.'
    noticeVariant = 'success'
  } else if (isConnected) {
    noticeTitle = '상대방 입장 대기 중'
    noticeMessage =
      '내 장비 연결은 완료되었습니다. 상대방이 같은 통화방에 입장하면 자동으로 표시됩니다.'
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

      <CallRoomHeader
        meetingId={meetingId}
        screenId={screenId}
        status={{
          label: isConnected ? `세션 ${sessionDuration}` : '연결 중',
          variant: isConnected ? 'success' : 'neutral',
        }}
      />

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
                <span aria-hidden="true" className="text-5xl">
                  ◎
                </span>
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
                <dd
                  className={
                    isCameraEnabled ? 'font-semibold text-emerald-700' : 'text-slate-500'
                  }
                >
                  {isCameraEnabled ? '켜짐' : '꺼짐'}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">마이크</dt>
                <dd
                  className={
                    isMicrophoneEnabled ? 'font-semibold text-emerald-700' : 'text-slate-500'
                  }
                >
                  {isMicrophoneEnabled ? '켜짐' : '꺼짐'}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <CallControls
        isCameraEnabled={isCameraEnabled}
        isConnected={isConnected}
        isMicrophoneEnabled={isMicrophoneEnabled}
        mediaAction={mediaAction}
        meetingId={meetingId}
        onRequestEnd={() => setEndDialogOpen(true)}
        onToggleCamera={() => void toggleCamera()}
        onToggleMicrophone={() => void toggleMicrophone()}
      />

      <EndCallDialog
        onConfirm={() => void leaveRoom()}
        onOpenChange={setEndDialogOpen}
        open={endDialogOpen}
      />
    </div>
  )
}
