export type VideoCallRoomProps = {
  screenId: string
  meetingId: string
  callSessionId?: string
  participantLabel: string
  endTo: string
  forceEndOnLeave?: boolean
}

export type MediaAction = 'camera' | 'microphone'
