export type VideoCallRoomProps = {
  screenId: string
  meetingId: string
  callSessionId?: string
  participantLabel: string
  endTo: string
}

export type MediaAction = 'camera' | 'microphone'
