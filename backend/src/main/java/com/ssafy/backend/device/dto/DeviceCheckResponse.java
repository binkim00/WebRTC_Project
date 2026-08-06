package com.ssafy.backend.device.dto;

import com.ssafy.backend.device.domain.DeviceCheck;

import java.time.LocalDateTime;

/**
 * 장비 점검 결과 저장 응답이다.
 *
 * <p>장비 이상이 있어도 입장을 막지 않기로 확정되어 {@code canEnter}는 항상 참이며
 * 실패 항목은 {@code warningRequired}로만 알린다.
 *
 * @param deviceCheckId 장비 점검 기록 식별자
 * @param cameraOk 카메라 정상 여부
 * @param microphoneOk 마이크 정상 여부
 * @param speakerOk 스피커 정상 여부이며 점검하지 않았으면 {@code null}
 * @param networkOk 네트워크 정상 여부
 * @param warningRequired 실패 항목이 있어 경고를 표시해야 하는지 여부
 * @param canEnter 입장 가능 여부이며 항상 참이다
 * @param checkedAt 점검 시각
 */
public record DeviceCheckResponse(
        Long deviceCheckId,
        boolean cameraOk,
        boolean microphoneOk,
        Boolean speakerOk,
        boolean networkOk,
        boolean warningRequired,
        boolean canEnter,
        LocalDateTime checkedAt
) {

    /**
     * 저장된 장비 점검 기록을 응답 형태로 변환한다.
     *
     * @param deviceCheck 저장된 장비 점검 기록
     * @param warningRequired 실패 항목이 있어 경고를 표시해야 하는지 여부
     * @param canEnter 입장 가능 여부
     * @return 장비 점검 결과 응답
     */
    public static DeviceCheckResponse of(DeviceCheck deviceCheck, boolean warningRequired,
                                         boolean canEnter) {
        return new DeviceCheckResponse(
                deviceCheck.getId(),
                deviceCheck.isCameraOk(),
                deviceCheck.isMicrophoneOk(),
                deviceCheck.getSpeakerOk(),
                deviceCheck.isNetworkOk(),
                warningRequired,
                canEnter,
                deviceCheck.getCheckedAt()
        );
    }
}
