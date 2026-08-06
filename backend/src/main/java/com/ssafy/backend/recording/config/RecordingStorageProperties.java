package com.ssafy.backend.recording.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 녹화 파일 저장과 보관 정책 설정이다.
 *
 * @param storageRoot 녹화 파일을 저장할 서버 디스크 최상위 경로
 * @param retentionDays 업로드 완료 후 보관 기간(일)
 * @param downloadTokenTtlSeconds 재생·다운로드 임시 토큰 유효 시간(초)
 * @param expirationCheckDelayMs 만료 대상 조회 주기(밀리초)
 * @param maxFileSizeBytes 업로드 허용 최대 파일 크기(바이트)
 */
@ConfigurationProperties(prefix = "app.recording")
public record RecordingStorageProperties(
        String storageRoot,
        int retentionDays,
        long downloadTokenTtlSeconds,
        long expirationCheckDelayMs,
        long maxFileSizeBytes
) {
}
