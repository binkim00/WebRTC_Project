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
}
