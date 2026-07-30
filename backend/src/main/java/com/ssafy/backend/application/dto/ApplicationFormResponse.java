package com.ssafy.backend.application.dto;

import com.ssafy.backend.application.domain.ApplicationForm;
import com.ssafy.backend.application.domain.ApplicationQuestion;

import java.util.List;

/**
 * 팬에게 노출할 응모 폼 안내문과 질문 목록이다.
 *
 * @param formId 응모 폼 식별자
 * @param formDescription 응모 안내문이며 없으면 null
 * @param questions 표시 순서대로 정렬된 질문 목록
 */
public record ApplicationFormResponse(
        Long formId,
        String formDescription,
        List<ApplicationFormQuestionResponse> questions
) {
    /**
     * 응모 폼과 활성 질문 목록을 조회 응답으로 변환한다.
     *
     * @param form 응모 폼 엔티티
     * @param questions 표시 순서대로 정렬된 활성 질문 목록
     * @return 응모 폼 조회 응답
     */
    public static ApplicationFormResponse of(
            ApplicationForm form, List<ApplicationQuestion> questions
    ) {
        return new ApplicationFormResponse(
                form.getId(),
                form.getFormDescription(),
                questions.stream().map(ApplicationFormQuestionResponse::from).toList()
        );
    }
}
