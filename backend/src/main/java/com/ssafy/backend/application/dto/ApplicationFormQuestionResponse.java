package com.ssafy.backend.application.dto;

import com.ssafy.backend.application.domain.ApplicationOption;
import com.ssafy.backend.application.domain.ApplicationQuestion;
import com.ssafy.backend.application.domain.ApplicationQuestionType;

import java.util.List;

/**
 * 응모 폼 조회와 저장 응답에서 질문 한 개를 표현한다.
 *
 * @param questionId 질문 식별자
 * @param questionText 질문 문구
 * @param questionType 질문 유형
 * @param required 필수 응답 여부
 * @param displayOrder 화면 표시 순서
 * @param options 객관식 질문의 선택지 목록이며 주관식 질문이면 빈 목록이다
 */
public record ApplicationFormQuestionResponse(
        Long questionId,
        String questionText,
        ApplicationQuestionType questionType,
        boolean required,
        Integer displayOrder,
        List<ApplicationFormOptionResponse> options
) {
    /**
     * 응모 질문 엔티티와 선택지를 응답 항목으로 변환한다.
     *
     * @param question 변환할 응모 질문
     * @param options 표시 순서대로 정렬된 선택지이며 주관식 질문이면 빈 목록
     * @return 응모 질문 응답 항목
     */
    public static ApplicationFormQuestionResponse of(
            ApplicationQuestion question, List<ApplicationOption> options
    ) {
        return new ApplicationFormQuestionResponse(
                question.getId(),
                question.getQuestionText(),
                question.getQuestionType(),
                question.isRequired(),
                question.getDisplayOrder(),
                options.stream().map(ApplicationFormOptionResponse::from).toList()
        );
    }
}
