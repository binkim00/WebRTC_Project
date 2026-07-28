package com.ssafy.backend.livekit.dto;

import jakarta.validation.constraints.NotBlank;

public record LiveKitTokenRequest(
        @NotBlank(message = "identity는 필수입니다.") String identity,
        String displayName,
        String metadata //AI에서 metadata에 입력된 사용자 타입, 언어 등을 받아서 사용함. 자세한 attribute는 notion API 명세 참고
) {
}
