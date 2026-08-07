package com.ssafy.backend.common.api;

import org.springframework.data.domain.Page;

import java.util.List;

/**
 * 목록 API의 페이지 정보와 데이터를 공통 형태로 전달한다.
 *
 * @param content 현재 페이지 데이터
 * @param page 현재 페이지 번호
 * @param size 페이지 크기
 * @param totalElements 전체 데이터 수
 * @param totalPages 전체 페이지 수
 * @param hasNext 다음 페이지 존재 여부
 * @param <T> 목록 데이터 타입
 */
public record PageResponse<T>(List<T> content, int page, int size, long totalElements,
                              int totalPages, boolean hasNext) {
    /**
     * Spring Data 페이지를 공통 페이지 응답으로 변환한다.
     *
     * @param source 변환할 Spring Data 페이지
     * @param <T> 페이지 데이터 타입
     * @return 공통 페이지 응답
     */
    public static <T> PageResponse<T> from(Page<T> source) {
        return new PageResponse<>(source.getContent(), source.getNumber(), source.getSize(),
                source.getTotalElements(), source.getTotalPages(), source.hasNext());
    }
}
