package com.ssafy.backend.recording.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** LiveKit Egress 녹화 기능 플래그와 출력 설정이다. */
@ConfigurationProperties(prefix = "app.recording.egress")
public record RecordingEgressProperties(
        boolean enabled,
        String outputRoot,
        String layout,
        int maxConcurrent,
        long capacityLeaseSeconds,
        long recoveryCheckDelayMs,
        long recoveryStaleSeconds,
        int recoveryBatchSize
) {
    public RecordingEgressProperties {
        outputRoot = outputRoot == null || outputRoot.isBlank() ? "/out" : outputRoot;
        layout = layout == null || layout.isBlank() ? "grid" : layout;
        maxConcurrent = maxConcurrent <= 0 ? 1 : maxConcurrent;
        capacityLeaseSeconds = capacityLeaseSeconds <= 0 ? 7200 : capacityLeaseSeconds;
        recoveryCheckDelayMs = recoveryCheckDelayMs <= 0 ? 30000 : recoveryCheckDelayMs;
        recoveryStaleSeconds = recoveryStaleSeconds <= 0 ? 60 : recoveryStaleSeconds;
        recoveryBatchSize = recoveryBatchSize <= 0 ? 20 : recoveryBatchSize;
    }
}
