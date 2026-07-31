package com.ssafy.backend.application.dto;

import com.ssafy.backend.common.api.PageResponse;

import java.util.List;

/**
 * 응모자 목록 조회 응답이다.
 *
 * <p>명세가 {@code totalApplications}와 {@code content}를 같은 깊이에 요구하므로
 * {@link PageResponse}의 페이지 정보를 평면으로 펼쳐 담는다. {@code totalApplications}는
 * 필터를 적용하지 않은 전체 유효 응모 수이고 {@code totalElements}는 필터를 적용한 결과 수다.
 *
 * @param totalApplications 필터와 무관한 전체 유효 응모 수
 * @param content 현재 페이지의 응모자 목록
 * @param page 현재 페이지 번호
 * @param size 페이지 크기
 * @param totalElements 필터를 적용한 전체 응모자 수
 * @param totalPages 전체 페이지 수
 * @param hasNext 다음 페이지 존재 여부
 */
public record ApplicantListResponse(
        long totalApplications,
        List<ApplicantResponse> content,
        int page,
        int size,
        long totalElements,
        int totalPages,
        boolean hasNext
) {
    /**
     * 전체 응모 수와 공통 페이지 응답을 응모자 목록 응답으로 합친다.
     *
     * @param totalApplications 필터와 무관한 전체 유효 응모 수
     * @param page 응모자 페이지 응답
     * @return 응모자 목록 응답
     */
    public static ApplicantListResponse of(
            long totalApplications, PageResponse<ApplicantResponse> page
    ) {
        return new ApplicantListResponse(
                totalApplications,
                page.content(),
                page.page(),
                page.size(),
                page.totalElements(),
                page.totalPages(),
                page.hasNext()
        );
    }
}
