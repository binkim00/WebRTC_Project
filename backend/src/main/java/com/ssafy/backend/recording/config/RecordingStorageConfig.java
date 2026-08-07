package com.ssafy.backend.recording.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/** 녹화 파일 저장 설정을 활성화한다. */
@Configuration
@EnableConfigurationProperties({
        RecordingStorageProperties.class,
        RecordingEgressProperties.class
})
public class RecordingStorageConfig {
}
