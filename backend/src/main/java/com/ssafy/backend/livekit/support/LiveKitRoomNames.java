package com.ssafy.backend.livekit.support;

/** 팬미팅별 LiveKit Room 이름 생성 규칙을 제공한다. */
public final class LiveKitRoomNames {

    private static final String MEETING_ROOM_PREFIX = "meeting-room-";

    /** 인스턴스 생성을 막는다. */
    private LiveKitRoomNames() {
    }

    /**
     * 팬미팅 하나가 공유하는 LiveKit Room 이름을 생성한다.
     *
     * @param meetingId 팬미팅 식별자
     * @return 팬미팅별 LiveKit Room 이름
     */
    public static String forMeeting(Long meetingId) {
        return MEETING_ROOM_PREFIX + meetingId;
    }
}
