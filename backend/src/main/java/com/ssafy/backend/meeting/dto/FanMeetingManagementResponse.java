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
     * @param now 대기실 개방 여부를 판단할 서버 시각
     * @return 최신 팬미팅 관리 응답
     */
    public static FanMeetingManagementResponse of(
            FanMeeting meeting,
            MeetingApplicationSetting application,
            MeetingOperationSetting operation,
            LocalDateTime now
    ) {
        return new FanMeetingManagementResponse(
                meeting.getId(), meeting.getStatus(), meeting.getInfluencer().getId(),
                meeting.getTitle(), meeting.getDescription(), meeting.getCoverImageUrl(),
                meeting.getScheduledStartAt(), meeting.getPublishedAt(), meeting.getCanceledAt(),
                meeting.getActualStartAt(), meeting.getActualEndAt(), meeting.getDeletedAt(),
                ApplicationSetting.from(application), OperationSetting.from(operation, now)
        );
    }

    /** 팬미팅 응모 설정 응답이다. */
    public record ApplicationSetting(boolean enabled, LocalDateTime startAt,
                                     LocalDateTime endAt, LocalDateTime resultAnnouncementAt,
                                     int capacity) {
        /**
         * 응모 설정 엔티티를 응답으로 변환한다.
         *
         * <p>설정이 없으면 응모를 사용하지 않는 형태로 반환한다.
         * 이는 응모를 끈 팬미팅을 생성할 때 저장하는 값과 같은 모양이다.
         *
         * @param setting 응모 설정이며 없으면 null
         * @return 응모 설정 응답
         */
        private static ApplicationSetting from(MeetingApplicationSetting setting) {
            if (setting == null) {
                return new ApplicationSetting(false, null, null, null, 0);
            }
            return new ApplicationSetting(setting.isEnabled(), setting.getApplicationOpenAt(),
                    setting.getApplicationCloseAt(), setting.getResultAnnouncementAt(),
                    setting.getCapacity());
        }
    }

    /**
     * 팬미팅 대기실과 개별 영상통화 운영 설정 응답이다.
     *
     * <p>{@code waitingRoomOpen}은 서버 시계로 판단한 대기실 개방 여부다. 클라이언트가
     * {@code queueOpenAt}과 브라우저 시각을 직접 비교하면 시계 차이와 캐시된 이전 값 때문에
     * 서버는 열렸다고 보는데 화면만 닫힌 것으로 안내하는 일이 생겨, 판단 결과를 함께 내려준다.
     */
    public record OperationSetting(LocalDateTime queueOpenAt, boolean waitingRoomOpen,
                                   int callDurationSec,
                                   boolean recordingEnabled, boolean translationEnabled,
                                   int reconnectGraceSec, int earlyStartMinutes,
                                   int maxRecallCount) {
        /** 운영 설정 엔티티를 응답으로 변환한다. */
        private static OperationSetting from(MeetingOperationSetting setting, LocalDateTime now) {
            return new OperationSetting(setting.getWaitingRoomOpenAt(),
                    setting.isWaitingRoomOpenAt(now),
                    setting.getCallDurationSec(), setting.isRecordingEnabled(),
                    setting.isTranslationEnabled(), setting.getReconnectGraceSec(),
                    setting.getEarlyStartMinutes(), setting.getMaxRecallCount());
        }
    }
}
