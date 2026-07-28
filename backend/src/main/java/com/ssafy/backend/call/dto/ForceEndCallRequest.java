package com.ssafy.backend.call.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 운영자가 통화를 강제로 종료한 사유를 전달한다.
 *
 * @param reason 강제 종료 사유
 */
public record ForceEndCallRequest(
        @NotBlank @Size(max = 255) String reason
) {
}
