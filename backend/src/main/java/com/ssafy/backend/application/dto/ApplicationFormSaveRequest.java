package com.ssafy.backend.application.dto;

import com.ssafy.backend.application.domain.ApplicationQuestionType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 운영자가 저장할 응모 안내문과 질문 전체 목록을 전달한다.
 *
 * <p>질문 목록은 부분 수정이 아니라 전체 교체다. 목록에 없는 기존 질문은 삭제 처리된다.
 * 질문 개수 상한은 전용 오류 코드로 응답해야 하므로 Bean Validation이 아니라 서비스에서 검증한다.
 *
 * @param formDescription 응모 안내문이며 없으면 null
 * @param questions 저장할 질문 전체 목록
 */
public record ApplicationFormSaveRequest(
        @Size(max = 2000) String formDescription,
        @NotNull List<@Valid QuestionRequest> questions
) {

    /**
     * 저장할 응모 질문 한 개를 전달한다.
     *
     * @param questionId 기존 질문을 수정할 때의 질문 식별자이며 새 질문이면 null
     * @param questionText 질문 문구
     * @param questionType 질문 유형이며 SHORT_TEXT 또는 LONG_TEXT만 허용한다
     * @param required 필수 응답 여부
     * @param displayOrder 화면 표시 순서
     */
    public record QuestionRequest(
            Long questionId,
            @NotBlank @Size(max = 500) String questionText,
            @NotNull ApplicationQuestionType questionType,
            @NotNull Boolean required,
            @NotNull @PositiveOrZero Integer displayOrder
    ) {
    }
}
