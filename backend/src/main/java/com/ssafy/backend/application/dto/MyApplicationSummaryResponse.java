package com.ssafy.backend.application.dto;

import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.application.domain.ApplicationStatus;
import com.ssafy.backend.meeting.domain.FanMeeting;

import java.time.LocalDateTime;

/**
 * 팬 마이페이지 응모 내역 목록의 한 항목이다.
 *
 * @param applicationId 응모 식별자
 * @param meetingId 팬미팅 식별자
 * @param meetingTitle 팬미팅 제목
 * @param coverImageUrl 팬미팅 커버 이미지 URL이며 없으면 null
 * @param influencerName 팬미팅을 진행하는 인플루언서 이름
 * @param scheduledStartAt 팬미팅 예정 시작 시각
 * @param applicationStatus 응모 상태
 * @param resultDecidedAt 응모 결과 확정 시각이며 미확정이면 null
 * @param callOrder 영상통화 호출 순서이며 참가자가 아니면 null
 */
public record MyApplicationSummaryResponse(
        Long applicationId,
        Long meetingId,
        String meetingTitle,
        String coverImageUrl,
        String influencerName,
        LocalDateTime scheduledStartAt,
        ApplicationStatus applicationStatus,
        LocalDateTime resultDecidedAt,
        Integer callOrder
) {
    /**
     * 응모와 참가자 배정 정보를 응모 내역 목록 항목으로 변환한다.
     *
     * @param application 조회한 응모
     * @param assignment 확정 참가자 배정 정보이며 참가자가 아니면 null
     * @return 응모 내역 목록 항목
     */
    public static MyApplicationSummaryResponse of(
            Application application, ParticipantAssignment assignment
    ) {
        FanMeeting meeting = application.getMeeting();
        return new MyApplicationSummaryResponse(
                application.getId(),
                meeting.getId(),
                meeting.getTitle(),
                meeting.getCoverImageUrl(),
                meeting.getInfluencer().getNickname(),
                meeting.getScheduledStartAt(),
                application.getStatus(),
                application.getResultDecidedAt(),
                assignment == null ? null : assignment.callOrder()
        );
    }
}
