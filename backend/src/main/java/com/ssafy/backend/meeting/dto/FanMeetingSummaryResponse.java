package com.ssafy.backend.meeting.dto;

import com.ssafy.backend.application.domain.ApplicationStatus;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;

import java.time.LocalDateTime;

/** 팬미팅 목록 한 항목에 표시할 요약 정보다. */
public record FanMeetingSummaryResponse(
        Long meetingId,
        String title,
        String coverImageUrl,
        String influencerName,
        LocalDateTime scheduledStartAt,
        FanMeetingStatus status,
        LocalDateTime applicationStartAt,
        LocalDateTime applicationEndAt,
        ApplicationStatus applicationStatus,
        long applicationCount,
        long participantCount
) {
    /**
     * 팬미팅 엔티티와 조회자 정보를 목록 응답으로 변환한다.
     *
     * @param meeting 팬미팅 엔티티
     * @param setting 응모 설정
     * @param applicationStatus 현재 조회자의 응모 상태
     * @param applicationCount 전체 응모자 수
     * @param participantCount 확정 참가자 수
     * @return 팬미팅 목록 요약 응답
     */
    public static FanMeetingSummaryResponse of(
            FanMeeting meeting, MeetingApplicationSetting setting,
            ApplicationStatus applicationStatus, long applicationCount, long participantCount
    ) {
        return new FanMeetingSummaryResponse(meeting.getId(), meeting.getTitle(),
                meeting.getCoverImageUrl(), meeting.getInfluencer().getNickname(),
                meeting.getScheduledStartAt(), meeting.getStatus(),
                setting.getApplicationOpenAt(), setting.getApplicationCloseAt(),
                applicationStatus, applicationCount, participantCount);
    }
}
