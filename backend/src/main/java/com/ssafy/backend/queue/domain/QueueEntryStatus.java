package com.ssafy.backend.queue.domain;

/**
 * 팬미팅 대기열 항목의 진행 상태다.
 */
public enum QueueEntryStatus {
    NOT_ENTERED,
    WAITING,
    CALLED,
    IN_CALL,
    DONE,
    NO_SHOW,
    SKIPPED,
    REMOVED
}
