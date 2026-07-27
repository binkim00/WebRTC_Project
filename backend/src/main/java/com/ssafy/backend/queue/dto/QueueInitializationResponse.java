package com.ssafy.backend.queue.dto;

/** 초기화된 팬미팅 대기열 항목 수를 반환한다. */
public record QueueInitializationResponse(Long fanMeetingId, int initializedCount) {
}
