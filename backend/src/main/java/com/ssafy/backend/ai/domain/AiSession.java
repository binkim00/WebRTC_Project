package com.ssafy.backend.ai.domain;

import com.ssafy.backend.call.domain.CallSession;
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
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 영상통화별 AI 통역 실행 단위와 처리 상태를 저장하는 엔티티다.
 */
@Getter
@Entity
@Table(
        name = "ai_sessions",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_ai_sessions_call_sequence",
                columnNames = {"call_session_id", "session_sequence"}
        )
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AiSession extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "translation_session_id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "call_session_id", nullable = false)
    private CallSession callSession;

    @Column(name = "session_sequence", nullable = false)
    private Integer sessionSequence;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private AiSessionStatus status;

    @Column(name = "source_language", nullable = false, length = 20)
    private String sourceLanguage;

    @Column(name = "target_language", nullable = false, length = 20)
    private String targetLanguage;

    @Column(name = "model_name", length = 100)
    private String modelName;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "ended_at")
    private LocalDateTime endedAt;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;
}
