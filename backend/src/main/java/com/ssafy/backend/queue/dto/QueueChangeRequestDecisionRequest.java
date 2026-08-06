package com.ssafy.backend.queue.dto;

import com.ssafy.backend.queue.domain.QueueChangeRequestDecision;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 매니저가 순서 변경 요청을 승인 또는 거절할 때 전달하는 처리 값이다.
 *
 * @param decision 승인 또는 거절 결정
 * @param newPosition 승인 시 적용할 대기 순번이며 생략하면 대기열 마지막으로 이동한다
 * @param rejectionReason 거절 사유이며 현재 스키마에는 저장하지 않는다
 */
public record QueueChangeRequestDecisionRequest(
        @NotNull QueueChangeRequestDecision decision,
        @Min(1) Integer newPosition,
        @Size(max = 500) String rejectionReason
) {
}
