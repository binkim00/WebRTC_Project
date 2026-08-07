package com.ssafy.backend.application.domain;

import com.ssafy.backend.common.entity.BaseTimeEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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

import java.time.LocalDateTime;
import java.util.Objects;

/**
 * 응모 폼에 포함되는 질문을 저장하는 엔티티다.
 */
@Getter
@Entity
@Table(name = "application_questions")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ApplicationQuestion extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "application_question_id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "application_form_id", nullable = false)
    private ApplicationForm applicationForm;

    @Column(name = "question_text", nullable = false, columnDefinition = "TEXT")
    private String questionText;

    @Enumerated(EnumType.STRING)
    @Column(name = "question_type", nullable = false, length = 30)
    private ApplicationQuestionType questionType;

    @Column(name = "is_required", nullable = false)
    private boolean required;

    @Column(name = "display_order", nullable = false)
    private Integer displayOrder;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    /**
     * 응모 폼에 새 질문을 생성한다.
     *
     * @param applicationForm 질문이 속한 응모 폼
     * @param questionText 질문 문구
     * @param questionType 질문 유형
     * @param required 필수 응답 여부
     * @param displayOrder 화면 표시 순서
     * @return 생성된 응모 질문
     */
    public static ApplicationQuestion create(
            ApplicationForm applicationForm,
            String questionText,
            ApplicationQuestionType questionType,
            boolean required,
            Integer displayOrder
    ) {
        ApplicationQuestion question = new ApplicationQuestion();
        question.applicationForm = Objects.requireNonNull(applicationForm);
        question.questionText = Objects.requireNonNull(questionText);
        question.questionType = Objects.requireNonNull(questionType);
        question.required = required;
        question.displayOrder = Objects.requireNonNull(displayOrder);
        return question;
    }

    /**
     * 삭제되지 않은 질문의 문구, 유형, 필수 여부와 순서를 수정한다.
     *
     * @param questionText 변경할 질문 문구
     * @param questionType 변경할 질문 유형
     * @param required 변경할 필수 응답 여부
     * @param displayOrder 변경할 화면 표시 순서
     * @throws IllegalStateException 이미 삭제된 질문인 경우
     */
    public void update(
            String questionText,
            ApplicationQuestionType questionType,
            boolean required,
            Integer displayOrder
    ) {
        if (deletedAt != null) {
            throw new IllegalStateException("삭제된 응모 질문은 수정할 수 없습니다.");
        }
        this.questionText = Objects.requireNonNull(questionText);
        this.questionType = Objects.requireNonNull(questionType);
        this.required = required;
        this.displayOrder = Objects.requireNonNull(displayOrder);
    }

    /**
     * 이미 제출된 답변을 보존하기 위해 질문을 실제 삭제하지 않고 삭제 시각만 기록한다.
     *
     * @param deletedAt 질문 삭제 시각
     */
    public void delete(LocalDateTime deletedAt) {
        if (this.deletedAt != null) {
            return;
        }
        this.deletedAt = Objects.requireNonNull(deletedAt);
    }
}
