package com.ssafy.backend.application.dto;

import com.ssafy.backend.application.domain.ApplicationForm;
import com.ssafy.backend.application.domain.ApplicationOption;
import com.ssafy.backend.application.domain.ApplicationQuestion;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 운영자가 저장한 응모 폼의 최종 상태다.
 *
 * @param formId 응모 폼 식별자
 * @param meetingId 응모 폼이 속한 팬미팅 식별자
 * @param formDescription 응모 안내문이며 없으면 null
 * @param questions 저장 후 표시 순서대로 정렬된 질문 목록
 * @param updatedAt 응모 폼 수정 시각
 */
public record ApplicationFormSaveResponse(
        Long formId,
        Long meetingId,
        String formDescription,
        List<ApplicationFormQuestionResponse> questions,
        LocalDateTime updatedAt
) {
    /**
     * 저장된 응모 폼과 질문 목록을 저장 응답으로 변환한다.
     *
     * @param form 저장된 응모 폼 엔티티
     * @param questions 표시 순서대로 정렬된 활성 질문 목록
     * @param optionsByQuestionId 질문 식별자별 선택지이며 주관식 질문은 값이 없다
     * @param updatedAt 응모 폼 수정 시각
     * @return 응모 폼 저장 응답
     */
    public static ApplicationFormSaveResponse of(
            ApplicationForm form,
            List<ApplicationQuestion> questions,
            Map<Long, List<ApplicationOption>> optionsByQuestionId,
            LocalDateTime updatedAt
    ) {
        return new ApplicationFormSaveResponse(
                form.getId(),
                form.getMeeting().getId(),
                form.getFormDescription(),
                questions.stream()
                        .map(question -> ApplicationFormQuestionResponse.of(
                                question,
                                optionsByQuestionId.getOrDefault(question.getId(), List.of())
                        ))
                        .toList(),
                updatedAt
        );
    }
}
