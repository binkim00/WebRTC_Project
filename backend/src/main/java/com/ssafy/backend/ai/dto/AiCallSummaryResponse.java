package com.ssafy.backend.ai.dto;

import com.ssafy.backend.ai.domain.AiCallSummary;

import java.time.LocalDateTime;

/**
 * 생성이 끝난 AI 통화 요약을 전달한다.
 *
 * @param callSummaryId 통화 요약 식별자
 * @param callSessionId 요약 대상 통화 세션 식별자
 * @param summary AI가 생성한 요약 본문
 * @param keywords AI가 추출한 핵심어이며 JSON 배열 형태의 문자열이다
 * @param createdAt 요약 생성이 시작된 시각
 */
public record AiCallSummaryResponse(
        Long callSummaryId,
        Long callSessionId,
        String summary,
        String keywords,
        LocalDateTime createdAt
) {

    /**
     * 통화 요약 엔티티를 조회 응답으로 변환한다.
     *
     * @param callSummary 생성이 끝난 통화 요약
     * @return 통화 요약 응답
     */
    public static AiCallSummaryResponse from(AiCallSummary callSummary) {
        return new AiCallSummaryResponse(
                callSummary.getId(),
                callSummary.getCallSession().getId(),
                callSummary.getSummary(),
                callSummary.getKeywords(),
                callSummary.getCreatedAt()
        );
    }
}
