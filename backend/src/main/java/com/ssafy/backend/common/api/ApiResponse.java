package com.ssafy.backend.common.api;

/**
 * 신규 비즈니스 API의 성공 응답을 일관된 형태로 감싼다.
 *
 * @param success 요청 성공 여부
 * @param data 응답 데이터
 * @param <T> 응답 데이터 타입
 */
public record ApiResponse<T>(boolean success, T data) {

    /**
     * 전달받은 데이터를 성공 응답으로 감싼다.
     *
     * @param data 응답 데이터
     * @param <T> 응답 데이터 타입
     * @return 성공 여부와 데이터가 포함된 응답
     */
    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(true, data);
    }
}
