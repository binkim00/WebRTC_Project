package com.ssafy.backend.queue.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 팬이 순서를 미뤄달라고 요청할 때 전달하는 사유다.
 *
 * @param requestReason 순서 미루기 요청 사유
 */
public record QueueChangeRequestCreateRequest(
        @NotBlank @Size(max = 500) String requestReason
) {
}
