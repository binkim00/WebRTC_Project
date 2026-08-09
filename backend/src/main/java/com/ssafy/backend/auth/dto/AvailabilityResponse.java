package com.ssafy.backend.auth.dto;

/**
 * 가입 전 중복 확인 결과다.
 *
 * @param target 확인한 항목
 * @param value 정규화한 뒤 실제로 확인에 사용한 값
 * @param available 지금 이 값으로 가입할 수 있으면 {@code true}
 */
public record AvailabilityResponse(AvailabilityTarget target, String value, boolean available) {

    /**
     * 확인 결과를 응답으로 만든다.
     *
     * @param target 확인한 항목
     * @param value 정규화한 값
     * @param available 사용 가능 여부
     * @return 중복 확인 응답
     */
    public static AvailabilityResponse of(AvailabilityTarget target, String value, boolean available) {
        return new AvailabilityResponse(target, value, available);
    }
}
