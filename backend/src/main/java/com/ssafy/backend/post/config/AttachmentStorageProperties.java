package com.ssafy.backend.post.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 공지 첨부파일 저장 정책 설정이다.
 *
 * @param storageRoot 첨부파일을 저장할 서버 디스크 최상위 경로
 * @param maxFileSizeBytes 업로드 허용 최대 파일 크기(바이트)
 */
@ConfigurationProperties(prefix = "app.attachment")
public record AttachmentStorageProperties(
        String storageRoot,
        long maxFileSizeBytes
) {
}
