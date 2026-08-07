package com.ssafy.backend.device.dto;

import jakarta.validation.constraints.NotNull;

/**
 * 장비 점검 결과 저장 요청이다.
 *
 * @param cameraOk 카메라 정상 여부
 * @param microphoneOk 마이크 정상 여부
 * @param speakerOk 스피커 정상 여부이며 점검하지 않았으면 생략한다
 * @param networkOk 네트워크 정상 여부
 */
public record DeviceCheckRequest(
        @NotNull Boolean cameraOk,
        @NotNull Boolean microphoneOk,
        Boolean speakerOk,
        @NotNull Boolean networkOk
) {
}
