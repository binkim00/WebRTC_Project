package com.ssafy.backend.queue.dto;

import com.ssafy.backend.queue.domain.QueueChangeRequestStatus;

import java.time.LocalDateTime;

/**
 * 접수된 순서 미루기 요청 결과를 팬에게 반환한다.
 *
 * @param requestId 순서 변경 요청 식별자
 * @param status 접수 직후 처리 상태
 * @param requestedAt 요청 접수 시각
 */
public record QueueChangeRequestCreateResponse(
        Long requestId,
        QueueChangeRequestStatus status,
        LocalDateTime requestedAt
) {
}
