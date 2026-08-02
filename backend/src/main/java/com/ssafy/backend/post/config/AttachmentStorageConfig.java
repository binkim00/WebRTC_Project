package com.ssafy.backend.post.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/** 공지 첨부파일 저장 설정을 활성화한다. */
@Configuration
@EnableConfigurationProperties(AttachmentStorageProperties.class)
public class AttachmentStorageConfig {
}
