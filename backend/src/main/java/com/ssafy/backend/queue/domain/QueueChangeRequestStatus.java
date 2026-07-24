package com.ssafy.backend.queue.domain;

/**
 * 대기 순서 변경 요청의 처리 상태다.
 */
public enum QueueChangeRequestStatus {
    PENDING,
    APPROVED,
    REJECTED
}
