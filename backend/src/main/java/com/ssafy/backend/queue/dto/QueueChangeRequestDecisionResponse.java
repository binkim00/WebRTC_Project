package com.ssafy.backend.queue.dto;

import com.ssafy.backend.queue.domain.QueueChangeRequestStatus;

import java.time.LocalDateTime;

/**
 * 순서 변경 요청 처리 결과를 반환한다.
 *
 * @param requestId 순서 변경 요청 식별자
 * @param status 처리 후 요청 상태
 * @param previousPosition 처리 직전 대기 순번
 * @param changedPosition 승인으로 적용된 새 대기 순번이며 거절이면 {@code null}이다
 * @param processedAt 요청 처리 시각
 */
public record QueueChangeRequestDecisionResponse(
        Long requestId,
        QueueChangeRequestStatus status,
        int previousPosition,
        Integer changedPosition,
        LocalDateTime processedAt
) {
}
