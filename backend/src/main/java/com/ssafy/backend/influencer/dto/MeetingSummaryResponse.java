package com.ssafy.backend.influencer.dto;

import com.ssafy.backend.influencer.repository.InfluencerProfileRepository;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;

import java.time.LocalDateTime;

/**
 * 인플루언서 상세에 노출하는 팬미팅 항목이다.
 * 예정·진행·종료를 한 목록으로 제공하고 {@code status}로 구분한다.
 *
 * @param meetingId 팬미팅 식별자
 * @param title 팬미팅 제목
 * @param coverImageUrl 팬미팅 대표 이미지 URL
 * @param scheduledStartAt 팬미팅 예정 시작 시각
 * @param status 팬미팅 진행 상태
 * @param applicationStartAt 응모 시작 시각이며 응모를 받지 않으면 null
 * @param applicationEndAt 응모 마감 시각이며 응모를 받지 않으면 null
 */
public record MeetingSummaryResponse(
        Long meetingId,
        String title,
        String coverImageUrl,
        LocalDateTime scheduledStartAt,
        FanMeetingStatus status,
        LocalDateTime applicationStartAt,
        LocalDateTime applicationEndAt
) {

    /**
     * 저장소 조회 결과를 팬미팅 응답 항목으로 변환한다.
     *
     * @param view 팬미팅과 응모 기간을 함께 담은 조회 결과
     * @return 팬미팅 응답 항목
     */
    public static MeetingSummaryResponse from(InfluencerProfileRepository.MeetingView view) {
        return new MeetingSummaryResponse(
                view.getMeetingId(),
                view.getTitle(),
                view.getCoverImageUrl(),
                view.getScheduledStartAt(),
                view.getStatus(),
                view.getApplicationStartAt(),
                view.getApplicationEndAt()
        );
    }
}
