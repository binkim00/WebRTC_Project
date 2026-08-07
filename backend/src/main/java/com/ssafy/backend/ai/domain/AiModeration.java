package com.ssafy.backend.ai.domain;

import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.user.domain.User;
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

/**
 * AI가 감지한 위험 발언과 운영자의 검토 결과를 저장하는 엔티티다.
 */
@Getter
@Entity
@Table(name = "ai_moderation")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AiModeration {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "moderation_id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "call_session_id", nullable = false)
    private CallSession callSession;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "subtitle_id", nullable = false)
    private AiSubtitle subtitle;

    @Column(name = "risk_type", nullable = false, length = 50)
    private String riskType;

    @Column(name = "risk_level", nullable = false, length = 30)
    private String riskLevel;

    @Column(name = "reason", nullable = false, columnDefinition = "TEXT")
    private String reason;

    @Column(name = "detected_at", nullable = false)
    private LocalDateTime detectedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reviewed_by")
    private User reviewedBy;

    @Column(name = "reviewer_role", length = 30)
    private String reviewerRole;

    @Column(name = "review_result", length = 30)
    private String reviewResult;

    @Column(name = "reviewed_at")
    private LocalDateTime reviewedAt;
}
