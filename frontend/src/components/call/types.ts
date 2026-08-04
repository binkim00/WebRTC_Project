export type VideoCallRoomProps = {
  screenId: string
  meetingId: string
  callSessionId?: string
  participantLabel: string
  endTo: string
  forceEndOnLeave?: boolean
  /**
   * 호스트(인플루언서)가 팬이 교체되는 동안에도 LiveKit 방에 머문다.
   *
   * 백엔드는 LiveKit Room을 **팬미팅당 하나**로 쓴다(`LiveKitRoomNames.forMeeting(meetingId)`).
   * HOST 토큰에는 `call_session_id`가 들어가지 않고 `RoomName(팬미팅)` 권한만 부여되므로
   * 호스트 입장 토큰은 통화 세션과 무관하며, 팬이 바뀌어도 다시 입장할 필요가 없다.
   *
   * 이 값이 true면 통화 세션이 끝나도 방을 나가지 않고 대기열의 다음 통화를 따라간다.
   * false(팬)면 자기 통화가 끝나는 즉시 방을 나가고 종료 화면으로 이동한다.
   */
  hostStaysConnected?: boolean
}

export type MediaAction = 'camera' | 'microphone'
