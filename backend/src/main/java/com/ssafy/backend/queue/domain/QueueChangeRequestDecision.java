package com.ssafy.backend.queue.domain;

/** 매니저가 순서 변경 요청에 내리는 처리 결정이다. */
public enum QueueChangeRequestDecision {
    APPROVED,
    REJECTED
}
