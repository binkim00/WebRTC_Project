package com.ssafy.backend.ai.domain;

/**
 * AI 통화 요약의 생성 진행 상태다.
 * 상태는 AI Agent가 기록하며 Spring은 조회만 한다.
 */
public enum AiCallSummaryStatus {
    /** Agent가 요약 생성을 시작했고 아직 끝나지 않은 상태다. */
    GENERATING,

    /** 요약 저장까지 정상적으로 끝난 상태다. */
    COMPLETED,

    /** 자막이 없거나 생성에 실패해 요약을 남기지 못한 상태다. */
    FAILED
}
