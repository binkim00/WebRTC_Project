package com.ssafy.backend.application.dto;

import com.ssafy.backend.application.domain.ApplicationAnswer;

/**
 * 응모자 목록에서 운영자가 확인하는 질문별 제출 답변이다.
 *
 * @param questionId 질문 식별자
 * @param questionText 질문 문구
 * @param answerText 제출한 답변 본문
 */
public record ApplicantAnswerResponse(Long questionId, String questionText, String answerText) {

    /**
     * 응모 답변 엔티티를 응답 항목으로 변환한다.
     *
     * @param answer 변환할 응모 답변
     * @return 응모 답변 응답 항목
     */
    public static ApplicantAnswerResponse from(ApplicationAnswer answer) {
        return new ApplicantAnswerResponse(
                answer.getQuestion().getId(),
                answer.getQuestion().getQuestionText(),
                answer.getAnswerText()
        );
    }
}
