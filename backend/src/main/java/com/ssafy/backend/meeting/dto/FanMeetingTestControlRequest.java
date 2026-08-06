package com.ssafy.backend.meeting.dto;

import com.ssafy.backend.meeting.domain.FanMeetingStatus;

import java.time.LocalDateTime;

/**
 * 테스트 및 장애 복구 시 팬미팅의 상태와 주요 일정을 강제로 조정하는 요청이다.
 *
 * @param status 강제로 설정할 팬미팅 상태
 * @param scheduledStartAt 강제로 설정할 팬미팅 예정 시작 시각
 * @param applicationOpenAt 강제로 설정할 응모 시작 시각
 * @param applicationCloseAt 강제로 설정할 응모 마감 시각
 * @param resultAnnouncementAt 강제로 설정할 결과 발표 시각
 * @param waitingRoomOpenAt 강제로 설정할 대기실 오픈 시각
 */
public record FanMeetingTestControlRequest(
        FanMeetingStatus status,
        LocalDateTime scheduledStartAt,
        LocalDateTime applicationOpenAt,
        LocalDateTime applicationCloseAt,
        LocalDateTime resultAnnouncementAt,
        LocalDateTime waitingRoomOpenAt
) {
}
