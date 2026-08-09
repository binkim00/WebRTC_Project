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

import java.time.LocalDateTime;
import java.util.Objects;

/**
 * 객관식 응모 질문에서 선택할 수 있는 항목을 저장하는 엔티티다.
 */
@Getter
@Entity
@Table(name = "application_options")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ApplicationOption extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "application_option_id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "application_question_id", nullable = false)
    private ApplicationQuestion question;

    @Column(name = "option_text", nullable = false, length = 500)
    private String optionText;

    @Column(name = "display_order", nullable = false)
    private Integer displayOrder;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    /**
     * 객관식 질문에 새 선택지를 생성한다.
     *
     * @param question 선택지가 속한 응모 질문
     * @param optionText 선택지 문구
     * @param displayOrder 화면 표시 순서
     * @return 생성된 응모 선택지
     */
    public static ApplicationOption create(
            ApplicationQuestion question, String optionText, Integer displayOrder
    ) {
        ApplicationOption option = new ApplicationOption();
        option.question = Objects.requireNonNull(question);
        option.optionText = Objects.requireNonNull(optionText);
        option.displayOrder = Objects.requireNonNull(displayOrder);
        return option;
    }

    /**
     * 삭제되지 않은 선택지의 문구와 표시 순서를 수정한다.
     *
     * @param optionText 변경할 선택지 문구
     * @param displayOrder 변경할 화면 표시 순서
     * @throws IllegalStateException 이미 삭제된 선택지인 경우
     */
    public void update(String optionText, Integer displayOrder) {
        if (deletedAt != null) {
            throw new IllegalStateException("삭제된 응모 선택지는 수정할 수 없습니다.");
        }
        this.optionText = Objects.requireNonNull(optionText);
        this.displayOrder = Objects.requireNonNull(displayOrder);
    }

    /**
     * 이미 제출된 답변이 가리키는 선택지를 남겨 두기 위해 실제 삭제하지 않고 삭제 시각만 기록한다.
     *
     * @param deletedAt 선택지 삭제 시각
     */
    public void delete(LocalDateTime deletedAt) {
        if (this.deletedAt != null) {
            return;
        }
        this.deletedAt = Objects.requireNonNull(deletedAt);
    }
}
