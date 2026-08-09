package com.ssafy.backend.meeting.dto;

import com.ssafy.backend.application.domain.ApplicationStatus;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import com.ssafy.backend.meeting.domain.MeetingOperationSetting;

import java.time.LocalDateTime;

/** 팬미팅 상세 정보와 현재 조회자의 응모·입장 가능 상태를 반환한다. */
public record FanMeetingDetailResponse(
        FanMeetingManagementResponse meeting,
        Influencer influencer,
        Viewer viewer
) {
    /**
     * 팬미팅 상세 응답을 생성한다.
     *
     * @param meeting 팬미팅 엔티티
     * @param application 응모 설정
     * @param operation 운영 설정
     * @param applicationStatus 현재 조회자의 응모 상태
     * @param participantStatus 현재 조회자의 참가자 상태
     * @param canApply 현재 조회자의 응모 가능 여부
     * @param canEnter 현재 조회자의 대기실 입장 가능 여부
     * @param now 대기실 개방 여부를 판단할 서버 시각
     * @return 팬미팅 상세 응답
     */
    public static FanMeetingDetailResponse of(
            FanMeeting meeting, MeetingApplicationSetting application,
            MeetingOperationSetting operation, ApplicationStatus applicationStatus,
            String participantStatus, boolean canApply, boolean canEnter,
            LocalDateTime now
    ) {
        return new FanMeetingDetailResponse(
                FanMeetingManagementResponse.of(meeting, application, operation, now),
                new Influencer(meeting.getInfluencer().getId(),
                        meeting.getInfluencer().getNickname(),
                        meeting.getInfluencer().getProfileImageUrl()),
                new Viewer(applicationStatus, participantStatus, canApply, canEnter)
        );
    }

    /** 팬미팅 진행 인플루언서 정보다. */
    public record Influencer(Long influencerId, String name, String profileImageUrl) {
    }

    /** 현재 조회자의 응모·참가·대기실 입장 상태다. */
    public record Viewer(ApplicationStatus applicationStatus, String participantStatus,
                         boolean canApply, boolean canEnter) {
    }
}
