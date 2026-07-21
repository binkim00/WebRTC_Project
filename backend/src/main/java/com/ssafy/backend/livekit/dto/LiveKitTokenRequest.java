package com.ssafy.backend.livekit.dto;

import jakarta.validation.constraints.NotBlank;

public record LiveKitTokenRequest(
        @NotBlank(message = "identity는 필수입니다.") String identity,
        String displayName
) {
}
