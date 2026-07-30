package com.ssafy.backend.meeting.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;

/**
 * 초안 팬미팅에서 선택적으로 변경할 값들을 전달한다.
 *
 * @param influencerId 변경할 인플루언서 식별자
 * @param title 변경할 제목
 * @param description 변경할 설명
 * @param coverImageUrl 변경할 커버 이미지 URL
 * @param scheduledStartAt 변경할 예정 시작 시각
 * @param application 변경할 응모 설정
 * @param operation 변경할 운영 설정
 */
public record FanMeetingUpdateRequest(
        Long influencerId,
        @Size(min = 1, max = 200) String title,
        String description,
        @Size(max = 2048) String coverImageUrl,
        LocalDateTime scheduledStartAt,
        @Valid ApplicationSettingPatch application,
        @Valid OperationSettingPatch operation
) {
    /**
     * 응모 설정의 선택적 변경 값을 전달한다.
     *
     * @param enabled 응모 기능 사용 여부
     * @param startAt 응모 시작 시각
     * @param endAt 응모 종료 시각
     * @param resultAnnouncementAt 결과 발표 시각
     * @param capacity 모집 인원
     */
    public record ApplicationSettingPatch(
            Boolean enabled,
            LocalDateTime startAt,
            LocalDateTime endAt,
            LocalDateTime resultAnnouncementAt,
            @PositiveOrZero Integer capacity
    ) {
    }

    /**
     * 운영 설정의 선택적 변경 값을 전달한다.
     *
     * @param queueOpenAt 대기실 개방 시각
     * @param callDurationSec 참가자당 영상통화 제한 시간
     * @param recordingEnabled 녹화 사용 여부
     * @param translationEnabled 번역 사용 여부
     */
    public record OperationSettingPatch(
            LocalDateTime queueOpenAt,
            @Positive Integer callDurationSec,
            Boolean recordingEnabled,
            Boolean translationEnabled
    ) {
    }
}
