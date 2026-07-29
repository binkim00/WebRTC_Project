package com.ssafy.backend.meeting.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;

public record FanMeetingCreateRequest(
        @NotNull Long influencerId,
        @NotBlank @Size(max = 200) String title,
        String description,
        @Size(max = 2048) String coverImageUrl,
        @NotNull @Future LocalDateTime scheduledStartAt,
        @NotNull @Valid ApplicationSettingRequest application,
        @NotNull @Valid OperationSettingRequest operation
) {
    public record ApplicationSettingRequest(
            @NotNull Boolean enabled,
            LocalDateTime startAt,
            LocalDateTime endAt,
            LocalDateTime resultAnnouncementAt,
            @NotNull @PositiveOrZero Integer capacity
    ) {
    }

    public record OperationSettingRequest(
            @NotNull LocalDateTime queueOpenAt,
            @NotNull @Positive Integer callDurationSec,
            @NotNull Boolean recordingEnabled,
            @NotNull Boolean translationEnabled
    ) {
    }
}
