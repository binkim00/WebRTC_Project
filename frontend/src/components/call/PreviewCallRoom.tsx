import { UserCircleIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import localPreviewImage from '../../assets/call-preview-local.jpg'
import remotePreviewImage from '../../assets/call-preview-remote.jpg'
import { CallStage } from './CallStage'
import { EndCallDialog } from './EndCallDialog'
import type { VideoCallRoomProps } from './types'

export function PreviewCallRoom({ endTo, participantLabel }: VideoCallRoomProps) {
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
