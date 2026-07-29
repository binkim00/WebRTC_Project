package com.ssafy.backend.ai.domain;

/**
 * AI 통역 세션의 실행 상태다.
 */
public enum AiSessionStatus {
    READY,
    RUNNING,
    COMPLETED,
    FAILED,
    STOPPED
}
