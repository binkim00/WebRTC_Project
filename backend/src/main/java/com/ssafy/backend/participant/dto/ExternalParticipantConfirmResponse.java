package com.ssafy.backend.participant.dto;

import com.ssafy.backend.meeting.domain.FanMeetingStatus;

import java.time.LocalDateTime;

/**
 * 외부 선별 명단 CSV 확정 결과다.
 *
 * @param meetingId 팬미팅 식별자
 * @param participantCount 생성된 참가자 수
 * @param queueEntryCount 생성된 대기열 항목 수
 * @param meetingStatus 확정 후 팬미팅 상태
 * @param confirmedAt 명단을 확정한 시각
 */
public record ExternalParticipantConfirmResponse(
        Long meetingId,
        int participantCount,
        int queueEntryCount,
        FanMeetingStatus meetingStatus,
        LocalDateTime confirmedAt
) {
}
