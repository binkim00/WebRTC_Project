package com.ssafy.backend.queue.domain;

/** 팬 화면에 단순화하여 노출하는 대기열 표시 상태다. */
public enum QueueDisplayStatus {
    WAITING,
    IN_CALL,
    COMPLETED;

    /**
     * 백엔드 대기열 상태를 팬 화면 표시 상태로 변환한다.
     *
     * @param status 백엔드에서 관리하는 대기열 상태
     * @return 팬 화면에 표시할 단순화된 상태
     */
    public static QueueDisplayStatus from(QueueEntryStatus status) {
        return switch (status) {
            case NOT_ENTERED, WAITING, CALLED -> WAITING;
            case IN_CALL -> IN_CALL;
            case DONE, NO_SHOW, SKIPPED, REMOVED -> COMPLETED;
        };
    }
}
