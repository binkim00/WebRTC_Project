package com.ssafy.backend.livekit.dto;

public record LiveKitTokenResponse(
        String liveKitUrl,
        String accessToken,
        String roomName,
        String identity
) {
}
