package com.ssafy.backend.application.dto;

import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.application.domain.ApplicationStatus;
import com.ssafy.backend.meeting.domain.FanMeeting;

import java.time.LocalDateTime;

/**
 * 팬이 조회하는 특정 팬미팅의 내 응모 결과다.
 *
 * @param applicationId 응모 식별자
 * @param applicationStatus 응모 상태
 * @param submittedAt 응모 제출 시각
 * @param resultDecidedAt 응모 결과 확정 시각이며 미확정이면 null
 * @param participantId 확정 참가자 식별자이며 참가자가 아니면 null
 * @param callOrder 영상통화 호출 순서이며 참가자가 아니면 null
 * @param callOrderSource 호출 순서를 결정한 방식이며 참가자가 아니면 null
 * @param meetingId 팬미팅 식별자
 * @param meetingTitle 팬미팅 제목
 * @param coverImageUrl 팬미팅 커버 이미지 URL이며 없으면 null
 * @param influencerName 팬미팅을 진행하는 인플루언서 이름
 * @param scheduledStartAt 팬미팅 예정 시작 시각
 */
public record MyApplicationResponse(
        Long applicationId,
        ApplicationStatus applicationStatus,
        LocalDateTime submittedAt,
        LocalDateTime resultDecidedAt,
        Long participantId,
        Integer callOrder,
        String callOrderSource,
        Long meetingId,
        String meetingTitle,
        String coverImageUrl,
        String influencerName,
        LocalDateTime scheduledStartAt
) {
    /**
     * 응모와 참가자 배정 정보를 내 응모 결과 응답으로 변환한다.
     *
     * @param application 조회한 응모
     * @param assignment 확정 참가자 배정 정보이며 참가자가 아니면 null
     * @return 내 응모 결과 응답
     */
    public static MyApplicationResponse of(
            Application application, ParticipantAssignment assignment
    ) {
        FanMeeting meeting = application.getMeeting();
        return new MyApplicationResponse(
                application.getId(),
                application.getStatus(),
                application.getSubmittedAt(),
                application.getResultDecidedAt(),
                assignment == null ? null : assignment.participantId(),
                assignment == null ? null : assignment.callOrder(),
                assignment == null ? null : assignment.callOrderSource(),
                meeting.getId(),
                meeting.getTitle(),
                meeting.getCoverImageUrl(),
                meeting.getInfluencer().getNickname(),
                meeting.getScheduledStartAt()
        );
    }
}
