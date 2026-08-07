package com.ssafy.backend.recording.dto;

import java.time.LocalDateTime;

/** 팬의 통화 녹화 동의 결과다. */
public record RecordingConsentResponse(
        Long callSessionId,
        LocalDateTime consentedAt
) {
}
