package com.ssafy.backend.recording.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** LiveKit Egress 녹화 기능 플래그와 출력 설정이다. */
@ConfigurationProperties(prefix = "app.recording.egress")
public record RecordingEgressProperties(
        boolean enabled,
        String outputRoot,
        String layout
) {
    public RecordingEgressProperties {
        outputRoot = outputRoot == null || outputRoot.isBlank() ? "/out" : outputRoot;
        layout = layout == null || layout.isBlank() ? "grid" : layout;
    }
}
