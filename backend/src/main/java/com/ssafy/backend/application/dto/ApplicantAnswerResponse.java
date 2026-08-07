package com.ssafy.backend.application.dto;

import com.ssafy.backend.application.domain.ApplicationAnswer;
import com.ssafy.backend.application.domain.ApplicationOption;

import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * 응모자 목록에서 운영자가 확인하는 질문별 제출 답변이다.
 *
 * @param questionId 질문 식별자
 * @param questionText 질문 문구
 * @param answerText 제출한 답변 본문이며 객관식이면 고른 선택지 문구다
 * @param selectedOptionIds 객관식에서 고른 선택지 식별자 목록이며 주관식이면 빈 목록이다
 */
public record ApplicantAnswerResponse(
        Long questionId,
        String questionText,
        String answerText,
        List<Long> selectedOptionIds
) {

    /** 복수 선택 답변을 한 줄로 붙일 때 쓰는 구분자다. */
    private static final String OPTION_DELIMITER = ", ";

    /**
     * 같은 질문에 속한 답변 행을 하나의 응답 항목으로 합친다.
     *
     * <p>복수 선택 질문은 고른 선택지 수만큼 답변 행이 생기므로, 운영자 화면에서 질문이 여러 번
     * 나오지 않도록 선택 순번대로 이어 붙인다.
     *
     * @param answers 같은 질문에 속한 답변 목록이며 선택 순번대로 정렬돼 있어야 한다
     * @return 응모 답변 응답 항목
     * @throws IllegalArgumentException 답변 목록이 비어 있는 경우
     */
    public static ApplicantAnswerResponse of(List<ApplicationAnswer> answers) {
        if (answers.isEmpty()) {
            throw new IllegalArgumentException("답변이 없는 질문은 응답으로 변환할 수 없습니다.");
        }
        ApplicationAnswer first = answers.get(0);
        if (first.getSelectedOption() == null) {
            return new ApplicantAnswerResponse(
                    first.getQuestion().getId(),
                    first.getQuestion().getQuestionText(),
                    first.getAnswerText(),
                    List.of()
            );
        }
        List<ApplicationOption> options = answers.stream()
                .map(ApplicationAnswer::getSelectedOption)
                .filter(Objects::nonNull)
                .toList();
        return new ApplicantAnswerResponse(
                first.getQuestion().getId(),
                first.getQuestion().getQuestionText(),
                options.stream()
                        .map(ApplicationOption::getOptionText)
                        .collect(Collectors.joining(OPTION_DELIMITER)),
                options.stream().map(ApplicationOption::getId).toList()
        );
    }
}
