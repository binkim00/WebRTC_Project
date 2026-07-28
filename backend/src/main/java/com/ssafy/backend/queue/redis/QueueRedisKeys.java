package com.ssafy.backend.queue.redis;

/** 대기열 실시간 상태에 사용하는 Redis Key를 한 곳에서 생성한다. */
public final class QueueRedisKeys {
    private static final String PREFIX = "fanmeeting:queue:";

    /** 인스턴스 생성을 차단한다. */
    private QueueRedisKeys() {
    }

    /** 초기화 완료 Key를 반환한다. */
    public static String initialized(Long meetingId) { return prefix(meetingId) + ":initialized"; }

    /** 참가자 순번 Sorted Set Key를 반환한다. */
    public static String order(Long meetingId) { return prefix(meetingId) + ":order"; }

    /** 참가자 상태 Hash Key를 반환한다. */
    public static String status(Long meetingId) { return prefix(meetingId) + ":status"; }

    /** 현재 호출 또는 통화 중인 참가자 Key를 반환한다. */
    public static String current(Long meetingId) { return prefix(meetingId) + ":current"; }

    /** 처리한 webhook 이벤트의 멱등성 Key를 반환한다. */
    public static String webhookEvent(String eventId) { return "livekit:webhook:event:" + eventId; }

    /** LiveKit Room의 호스트 접속 상태 Key를 반환한다. */
    public static String liveKitHostPresence(String roomId) {
        return "livekit:room:" + roomId + ":host";
    }

    /** 통화 세션의 팬 접속 상태 Key를 반환한다. */
    public static String liveKitFanPresence(Long callSessionId) {
        return "livekit:call-session:" + callSessionId + ":fan";
    }

    /** 통화 세션의 마지막 연결 종료 역할 Key를 반환한다. */
    public static String liveKitDisconnectRole(Long callSessionId) {
        return "livekit:call-session:" + callSessionId + ":disconnect-role";
    }

    /** 팬미팅별 공통 Key 접두사를 반환한다. */
    private static String prefix(Long meetingId) { return PREFIX + meetingId; }
}
