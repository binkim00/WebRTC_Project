package com.ssafy.backend.application.dto;

import java.util.List;
import java.util.Map;

/**
 * 응모 관리 화면의 응모 현황과 질문별 응답 통계다.
 *
 * @param totalApplications 취소를 제외한 전체 응모 수
 * @param submittedCount 접수 상태 응모 수
 * @param selectedCount 당첨 상태 응모 수
 * @param notSelectedCount 미당첨 상태 응모 수
 * @param questionStats 질문별 응답 통계
 */
public record ApplicationStatisticsResponse(
        long totalApplications,
        long submittedCount,
        long selectedCount,
        long notSelectedCount,
        List<QuestionStatResponse> questionStats
) {

    /**
     * 질문 한 개의 응답 통계다.
     *
     * <p>{@code optionCounts}는 객관식 질문 전용 집계이며 선택지 식별자를 키로 쓴다. 아무도 고르지
     * 않은 선택지도 0으로 채워 화면이 선택지 목록을 그대로 그릴 수 있게 한다.
     * {@code responseCount}는 답변 행 수가 아니라 응답한 응모 수이므로 복수 선택 질문에서도
     * 부풀지 않는다.
     *
     * @param questionId 질문 식별자
     * @param questionText 질문 문구
     * @param responseCount 취소를 제외한 응답 수
     * @param optionCounts 선택지별 응답 수이며 주관식 질문이면 null
     */
    public record QuestionStatResponse(
            Long questionId,
            String questionText,
            long responseCount,
            Map<Long, Long> optionCounts
    ) {
    }
}
