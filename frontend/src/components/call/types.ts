import type { ReactNode } from 'react'

export type VideoCallRoomProps = {
  screenId: string
  meetingId: string
  callSessionId?: string
  participantLabel: string
  endTo: string
  forceEndOnLeave?: boolean
  /** 통화 무대 오른쪽에 붙는 정보 패널이다. 인플루언서 통화의 팬 정보·운영 블록이 사용한다. */
  sidePanel?: ReactNode
}

export type MediaAction = 'camera' | 'microphone'
