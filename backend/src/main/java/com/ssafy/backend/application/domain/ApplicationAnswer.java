package com.ssafy.backend.application.domain;

import com.ssafy.backend.common.entity.BaseTimeEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.Objects;

/**
 * 응모자가 질문별로 제출한 답변을 저장하는 엔티티다.
 */
@Getter
@Entity
@Table(name = "application_answers")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ApplicationAnswer extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "application_answer_id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "application_id", nullable = false)
    private Application application;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "application_question_id", nullable = false)
    private ApplicationQuestion question;

    @Column(name = "answer_text", columnDefinition = "TEXT")
    private String answerText;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "selected_option_id")
    private ApplicationOption selectedOption;

    @Column(name = "answer_sequence", nullable = false)
    private Integer answerSequence;

    /**
     * 응모의 주관식 질문 답변을 생성한다.
     *
     * @param application 답변이 속한 응모
     * @param question 답변 대상 질문
     * @param answerText 제출한 답변 본문
     * @return 생성된 응모 답변
     */
    public static ApplicationAnswer createTextAnswer(
            Application application, ApplicationQuestion question, String answerText
    ) {
        ApplicationAnswer answer = new ApplicationAnswer();
        answer.application = Objects.requireNonNull(application);
        answer.question = Objects.requireNonNull(question);
        answer.answerText = Objects.requireNonNull(answerText);
        answer.answerSequence = 1;
        return answer;
    }

    /**
     * 응모의 객관식 질문 답변을 선택지 하나마다 한 건씩 생성한다.
     *
     * <p>복수 선택 질문은 고른 선택지 수만큼 답변 행이 생기며, 같은 질문 안에서
     * {@code answerSequence}로 선택 순서를 구분한다. 답변 본문은 선택지가 대신하므로 비운다.
     *
     * @param application 답변이 속한 응모
     * @param question 답변 대상 질문
     * @param selectedOption 팬이 고른 선택지
     * @param answerSequence 같은 질문 안에서 1부터 매기는 선택 순번
     * @return 생성된 응모 답변
     */
    public static ApplicationAnswer createChoiceAnswer(
            Application application,
            ApplicationQuestion question,
            ApplicationOption selectedOption,
            int answerSequence
    ) {
        ApplicationAnswer answer = new ApplicationAnswer();
        answer.application = Objects.requireNonNull(application);
        answer.question = Objects.requireNonNull(question);
        answer.selectedOption = Objects.requireNonNull(selectedOption);
        answer.answerSequence = answerSequence;
        return answer;
    }
}
