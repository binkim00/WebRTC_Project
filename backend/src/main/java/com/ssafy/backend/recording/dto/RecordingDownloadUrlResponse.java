package com.ssafy.backend.recording.dto;

import java.time.LocalDateTime;

/**
 * 녹화 재생·다운로드용 임시 URL 정보를 전달한다.
 *
 * <p>URL에는 서명된 단기 토큰이 담겨 있어 브라우저 {@code <video>} 태그에 그대로 넣을 수 있다.
 *
 * @param recordingId 녹화 식별자
 * @param downloadUrl 토큰이 포함된 재생·다운로드 URL
 * @param expiresAt 토큰 만료 시각
 * @param expiresInSeconds 토큰 유효 시간(초)
 */
public record RecordingDownloadUrlResponse(
        Long recordingId,
        String downloadUrl,
        LocalDateTime expiresAt,
        long expiresInSeconds
) {
}
