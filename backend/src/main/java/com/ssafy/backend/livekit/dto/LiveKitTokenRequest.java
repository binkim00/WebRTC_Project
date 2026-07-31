package com.ssafy.backend.livekit.dto;

import jakarta.validation.constraints.NotBlank;

import java.util.Map;

/**
 * 로컬 LiveKit 테스트 토큰 발급 요청이다.
 *
 * @param identity LiveKit 참가자 식별자
 * @param displayName LiveKit에 표시할 참가자 이름
 * @param attributes AI Agent가 읽을 참가자별 속성
 */
public record LiveKitTokenRequest(
        @NotBlank(message = "identity는 필수입니다.") String identity,
        String displayName,
        Map<String, String> attributes
) {
}
