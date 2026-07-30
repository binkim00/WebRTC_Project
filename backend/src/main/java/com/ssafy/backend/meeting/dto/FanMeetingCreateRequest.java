package com.ssafy.backend.meeting.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;

/**
 * 팬미팅 기본 정보와 응모·운영 설정 생성 값을 전달한다.
 *
 * @param influencerId 진행 인플루언서 식별자
 * @param title 팬미팅 제목
 * @param description 팬미팅 설명
 * @param coverImageUrl 커버 이미지 URL
 * @param scheduledStartAt 예정 시작 시각
 * @param application 응모 설정
 * @param operation 운영 설정
 */
public record FanMeetingCreateRequest(
        @NotNull Long influencerId,
        @NotBlank @Size(max = 200) String title,
        String description,
        @Size(max = 2048) String coverImageUrl,
        @NotNull @Future LocalDateTime scheduledStartAt,
        @NotNull @Valid ApplicationSettingRequest application,
        @NotNull @Valid OperationSettingRequest operation
) {
    /**
     * 팬미팅 생성 시 적용할 응모 설정을 전달한다.
     *
     * @param enabled 응모 기능 사용 여부
     * @param startAt 응모 시작 시각
     * @param endAt 응모 종료 시각
     * @param resultAnnouncementAt 결과 발표 시각
     * @param capacity 모집 인원
     */
    public record ApplicationSettingRequest(
            @NotNull Boolean enabled,
            LocalDateTime startAt,
            LocalDateTime endAt,
            LocalDateTime resultAnnouncementAt,
            @NotNull @PositiveOrZero Integer capacity
    ) {
    }

    /**
     * 팬미팅 생성 시 적용할 대기실·통화 운영 설정을 전달한다.
     *
     * @param queueOpenAt 대기실 개방 시각
     * @param callDurationSec 참가자당 영상통화 제한 시간
     * @param recordingEnabled 녹화 사용 여부
     * @param translationEnabled 번역 사용 여부
     * @param reconnectGraceSec 재접속 유예시간이며 생략하면 60초
     * @param earlyStartMinutes 조기 시작 허용시간이며 생략하면 30분
     * @param maxRecallCount 최대 재호출 횟수이며 생략하면 1회
     */
    public record OperationSettingRequest(
            @NotNull LocalDateTime queueOpenAt,
            @NotNull @Positive Integer callDurationSec,
            @NotNull Boolean recordingEnabled,
            @NotNull Boolean translationEnabled,
            @PositiveOrZero Integer reconnectGraceSec,
            @PositiveOrZero Integer earlyStartMinutes,
            @PositiveOrZero Integer maxRecallCount
    ) {
    }
}
