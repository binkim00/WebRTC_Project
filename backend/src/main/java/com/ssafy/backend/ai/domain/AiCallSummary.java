package com.ssafy.backend.ai.domain;

import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.common.entity.BaseCreatedTimeEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 통화 종료 후 생성된 AI 요약과 핵심어를 저장하는 엔티티다.
 */
@Getter
@Entity
@Table(name = "ai_call_summary")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AiCallSummary extends BaseCreatedTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "call_summary_id", nullable = false)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "call_session_id", nullable = false, unique = true)
    private CallSession callSession;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private AiCallSummaryStatus status;

    // 생성 시작 시점에 행이 먼저 만들어지므로 완료 전에는 요약과 핵심어가 비어 있다.
    @Column(name = "summary", columnDefinition = "TEXT")
    private String summary;

    @Column(name = "keywords", columnDefinition = "TEXT")
    private String keywords;

    /**
     * 팬이 기념 카드 문구를 고를 때 보여줄 후보이며 JSON 배열 형태의 문자열이다.
     * 요약과 같은 모델 호출에서 함께 생성되므로 Agent가 이 열까지 한 번에 채운다.
     */
    @Column(name = "card_candidates", columnDefinition = "TEXT")
    private String cardCandidates;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    // 운영 진단용이며 클라이언트 응답에는 포함하지 않는다.
    @Column(name = "failure_reason", length = 500)
    private String failureReason;
}
