package com.ssafy.backend.application.dto;

import java.time.LocalDateTime;

/**
 * 당첨자 추첨 결과를 전달한다.
 *
 * @param selectedCount 당첨 처리된 응모 수
 * @param notSelectedCount 미당첨 처리된 응모 수
 * @param participantCount 생성된 참가자 수
 * @param drawCompletedAt 추첨이 완료된 시각
 */
public record DrawResultResponse(
        long selectedCount,
        long notSelectedCount,
        long participantCount,
        LocalDateTime drawCompletedAt
) {
}
