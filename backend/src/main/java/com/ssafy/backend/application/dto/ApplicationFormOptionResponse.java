package com.ssafy.backend.application.dto;

import com.ssafy.backend.application.domain.ApplicationOption;

/**
 * 객관식 응모 질문의 선택지 한 개를 표현한다.
 *
 * @param optionId 선택지 식별자
 * @param optionText 선택지 문구
 * @param displayOrder 화면 표시 순서
 */
public record ApplicationFormOptionResponse(
        Long optionId,
        String optionText,
        Integer displayOrder
) {
    /**
     * 응모 선택지 엔티티를 응답 항목으로 변환한다.
     *
     * @param option 변환할 응모 선택지
     * @return 응모 선택지 응답 항목
     */
    public static ApplicationFormOptionResponse from(ApplicationOption option) {
        return new ApplicationFormOptionResponse(
                option.getId(),
                option.getOptionText(),
                option.getDisplayOrder()
        );
    }
}
