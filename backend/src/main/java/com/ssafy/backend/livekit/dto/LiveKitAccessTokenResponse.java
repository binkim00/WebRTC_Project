package com.ssafy.backend.livekit.dto;

import java.time.LocalDateTime;

/**
 * 실제 팬미팅 LiveKit 입장에 필요한 공개 연결 정보다.
 *
 * @param liveKitUrl            LiveKit 서버 WebSocket URL
 * @param accessToken           LiveKit 방 입장 토큰
 * @param expiresAt             입장 토큰 만료 시각
 * @param reconnectAllowedUntil 재접속 허용 종료 시각이며 제한이 시작되지 않았다면 null
 */
public record LiveKitAccessTokenResponse(
        String liveKitUrl,
        String accessToken,
        LocalDateTime expiresAt,
        LocalDateTime reconnectAllowedUntil
) {
}
