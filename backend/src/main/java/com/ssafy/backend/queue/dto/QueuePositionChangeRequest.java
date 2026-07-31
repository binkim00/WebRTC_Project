package com.ssafy.backend.queue.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * 매니저가 지정한 참가자 한 명의 새 대기 순번을 전달한다.
 *
 * @param newPosition 이동할 대기 순번이며 1부터 시작한다
 */
public record QueuePositionChangeRequest(
        @NotNull @Min(1) Integer newPosition
) {
}
