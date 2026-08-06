package com.ssafy.backend.application.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 팬의 개인정보 동의와 응모 질문 답변을 전달한다.
 *
 * @param personalInformationConsent 개인정보 수집 및 이용 동의 여부
 * @param answers 응모 질문 답변 목록
 */
public record ApplicationSubmitRequest(
        boolean personalInformationConsent,
        @NotNull @Size(max = 10) List<@Valid AnswerRequest> answers
) {

    /**
     * 응모 질문 하나의 텍스트 답변을 전달한다.
     *
     * @param questionId 질문 식별자
     * @param value 답변 본문
     */
    public record AnswerRequest(@NotNull Long questionId, @NotBlank String value) {
    }
}
