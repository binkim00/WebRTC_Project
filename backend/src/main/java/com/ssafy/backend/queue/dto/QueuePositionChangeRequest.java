package com.ssafy.backend.queue.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 매니저가 지정한 참가자 한 명의 새 대기 순번과 변경 사유를 전달한다.
 *
 * @param newPosition 이동할 대기 순번이며 1부터 시작한다
 * @param reason 팬에게 안내할 변경 사유이며 비워 두면 기본 안내 문구를 사용한다
 */
public record QueuePositionChangeRequest(
        @NotNull @Min(1) Integer newPosition,
        @Size(max = 200) String reason
) {
}
