package com.ssafy.backend.meeting.dto;

import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import com.ssafy.backend.meeting.domain.MeetingOperationSetting;

import java.time.LocalDateTime;

/**
 * 팬미팅 관리 명령 후 최신 상태와 설정을 반환한다.
 */
public record FanMeetingManagementResponse(
        Long meetingId,
        FanMeetingStatus status,
        Long influencerId,
        String title,
        String description,
        String coverImageUrl,
        LocalDateTime scheduledStartAt,
        LocalDateTime publishedAt,
        LocalDateTime canceledAt,
        LocalDateTime actualStartAt,
        LocalDateTime actualEndAt,
        LocalDateTime deletedAt,
        ApplicationSetting application,
        OperationSetting operation
) {
    /**
     * 팬미팅 엔티티와 설정을 관리 응답으로 변환한다.
     *
     * @param meeting 팬미팅 엔티티
     * @param application 응모 설정
     * @param operation 운영 설정
     * @return 최신 팬미팅 관리 응답
     */
    public static FanMeetingManagementResponse of(
            FanMeeting meeting,
            MeetingApplicationSetting application,
            MeetingOperationSetting operation
    ) {
        return new FanMeetingManagementResponse(
                meeting.getId(), meeting.getStatus(), meeting.getInfluencer().getId(),
                meeting.getTitle(), meeting.getDescription(), meeting.getCoverImageUrl(),
                meeting.getScheduledStartAt(), meeting.getPublishedAt(), meeting.getCanceledAt(),
                meeting.getActualStartAt(), meeting.getActualEndAt(), meeting.getDeletedAt(),
                ApplicationSetting.from(application), OperationSetting.from(operation)
        );
    }

    /** 팬미팅 응모 설정 응답이다. */
    public record ApplicationSetting(boolean enabled, LocalDateTime startAt,
                                     LocalDateTime endAt, LocalDateTime resultAnnouncementAt,
                                     int capacity) {
        /** 응모 설정 엔티티를 응답으로 변환한다. */
        private static ApplicationSetting from(MeetingApplicationSetting setting) {
            return new ApplicationSetting(setting.isEnabled(), setting.getApplicationOpenAt(),
                    setting.getApplicationCloseAt(), setting.getResultAnnouncementAt(),
                    setting.getCapacity());
        }
    }

    /** 팬미팅 대기실과 개별 영상통화 운영 설정 응답이다. */
    public record OperationSetting(LocalDateTime queueOpenAt, int callDurationSec,
                                   boolean recordingEnabled, boolean translationEnabled,
                                   int reconnectGraceSec, int earlyStartMinutes,
                                   int maxRecallCount) {
        /** 운영 설정 엔티티를 응답으로 변환한다. */
        private static OperationSetting from(MeetingOperationSetting setting) {
            return new OperationSetting(setting.getWaitingRoomOpenAt(),
                    setting.getCallDurationSec(), setting.isRecordingEnabled(),
                    setting.isTranslationEnabled(), setting.getReconnectGraceSec(),
                    setting.getEarlyStartMinutes(), setting.getMaxRecallCount());
        }
    }
}
