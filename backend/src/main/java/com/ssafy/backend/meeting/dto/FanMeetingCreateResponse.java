package com.ssafy.backend.meeting.dto;

import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import com.ssafy.backend.meeting.domain.MeetingOperationSetting;

import java.time.LocalDateTime;

public record FanMeetingCreateResponse(
        Long meetingId,
        FanMeetingStatus status,
        Long organizationId,
        Long managerId,
        Long influencerId,
        String title,
        String description,
        String coverImageUrl,
        LocalDateTime scheduledStartAt,
        ApplicationSettingResponse application,
        OperationSettingResponse operation,
        LocalDateTime createdAt
) {
    public static FanMeetingCreateResponse of(
            FanMeeting meeting,
            MeetingApplicationSetting application,
            MeetingOperationSetting operation
    ) {
        return new FanMeetingCreateResponse(
                meeting.getId(),
                meeting.getStatus(),
                meeting.getOrganization() == null ? null : meeting.getOrganization().getId(),
                meeting.getManager() == null ? null : meeting.getManager().getId(),
                meeting.getInfluencer().getId(),
                meeting.getTitle(),
                meeting.getDescription(),
                meeting.getCoverImageUrl(),
                meeting.getScheduledStartAt(),
                ApplicationSettingResponse.from(application),
                OperationSettingResponse.from(operation),
                meeting.getCreatedAt()
        );
    }

    public record ApplicationSettingResponse(
            boolean enabled,
            LocalDateTime startAt,
            LocalDateTime endAt,
            LocalDateTime resultAnnouncementAt,
            int capacity
    ) {
        private static ApplicationSettingResponse from(MeetingApplicationSetting setting) {
            return new ApplicationSettingResponse(
                    setting.isEnabled(),
                    setting.getApplicationOpenAt(),
                    setting.getApplicationCloseAt(),
                    setting.getResultAnnouncementAt(),
                    setting.getCapacity()
            );
        }
    }

    public record OperationSettingResponse(
            LocalDateTime queueOpenAt,
            int callDurationSec,
            boolean recordingEnabled,
            boolean translationEnabled
    ) {
        private static OperationSettingResponse from(MeetingOperationSetting setting) {
            return new OperationSettingResponse(
                    setting.getWaitingRoomOpenAt(),
                    setting.getCallDurationSec(),
                    setting.isRecordingEnabled(),
                    setting.isTranslationEnabled()
            );
        }
    }
}
