package com.ssafy.backend.queue.dto;

import java.time.LocalDateTime;

/**
 * 대기 순서 변경 결과를 반환한다.
 *
 * @param previousPosition 이동 직전 대기 순번
 * @param newPosition 이동 후 적용된 대기 순번
 * @param updatedAt 순서 변경을 반영한 시각
 */
public record QueuePositionChangeResponse(
        int previousPosition,
        int newPosition,
        LocalDateTime updatedAt
) {
}
