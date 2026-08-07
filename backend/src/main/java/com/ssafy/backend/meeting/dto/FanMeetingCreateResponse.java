package com.ssafy.backend.meeting.dto;

import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import com.ssafy.backend.meeting.domain.MeetingOperationSetting;

import java.time.LocalDateTime;

/**
 * 생성된 초안 팬미팅의 전체 기본 정보와 설정을 반환한다.
 *
 * @param meetingId 팬미팅 식별자
 * @param status 팬미팅 상태
 * @param organizationId 소속 조직 식별자
 * @param managerId 담당 매니저 식별자
 * @param influencerId 진행 인플루언서 식별자
 * @param title 팬미팅 제목
 * @param description 팬미팅 설명
 * @param coverImageUrl 커버 이미지 URL
 * @param scheduledStartAt 예정 시작 시각
 * @param application 응모 설정
 * @param operation 운영 설정
 * @param createdAt 생성 시각
 */
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
    /**
     * 생성된 팬미팅과 설정 엔티티를 응답으로 변환한다.
     *
     * @param meeting 팬미팅 엔티티
     * @param application 응모 설정 엔티티
     * @param operation 운영 설정 엔티티
     * @return 팬미팅 생성 응답
     */
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

    /** 팬미팅 생성 결과의 응모 설정이다. */
    public record ApplicationSettingResponse(
            boolean enabled,
            LocalDateTime startAt,
            LocalDateTime endAt,
            LocalDateTime resultAnnouncementAt,
            int capacity
    ) {
        /** 응모 설정 엔티티를 생성 응답으로 변환한다. */
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

    /** 팬미팅 생성 결과의 대기실·통화 운영 설정이다. */
    public record OperationSettingResponse(
            LocalDateTime queueOpenAt,
            int callDurationSec,
            boolean recordingEnabled,
            boolean translationEnabled,
            int reconnectGraceSec,
            int earlyStartMinutes,
            int maxRecallCount
    ) {
        /** 운영 설정 엔티티를 생성 응답으로 변환한다. */
        private static OperationSettingResponse from(MeetingOperationSetting setting) {
            return new OperationSettingResponse(
                    setting.getWaitingRoomOpenAt(),
                    setting.getCallDurationSec(),
                    setting.isRecordingEnabled(),
                    setting.isTranslationEnabled(),
                    setting.getReconnectGraceSec(),
                    setting.getEarlyStartMinutes(),
                    setting.getMaxRecallCount()
            );
        }
    }
}
