package com.ssafy.backend.post.domain;

import com.ssafy.backend.common.entity.BaseTimeEntity;
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
import java.util.Objects;

/**
 * 댓글 신고 내용과 운영자의 처리 결과를 저장하는 엔티티다.
 */
@Getter
@Entity
@Table(name = "comment_reports")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CommentReport extends BaseTimeEntity {

    /** 접수 직후 운영자 검토를 기다리는 상태 값이다. */
    public static final String STATUS_RECEIVED = "RECEIVED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "comment_report_id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "comment_id", nullable = false)
    private PostComment comment;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "reporter_user_id", nullable = false)
    private User reporter;

    @Column(name = "reason", nullable = false, length = 100)
    private String reason;

    @Column(name = "detail", columnDefinition = "TEXT")
    private String detail;

    @Column(name = "status", nullable = false, length = 30)
    private String status;

    @Column(name = "reported_at", nullable = false)
    private LocalDateTime reportedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "processed_by_user_id")
    private User processedBy;

    @Column(name = "processed_at")
    private LocalDateTime processedAt;

    /**
     * 댓글 신고를 접수 상태로 초기화한다.
     *
     * @param comment 신고 대상 댓글
     * @param reporter 신고자
     * @param reason 신고 사유
     * @param detail 상세 설명이며 없으면 null
     * @param reportedAt 신고 접수 시각
     */
    private CommentReport(PostComment comment, User reporter, String reason, String detail,
                          LocalDateTime reportedAt) {
        this.comment = Objects.requireNonNull(comment);
        this.reporter = Objects.requireNonNull(reporter);
        this.reason = Objects.requireNonNull(reason);
        this.detail = detail;
        this.status = STATUS_RECEIVED;
        this.reportedAt = Objects.requireNonNull(reportedAt);
        // 운영자 처리는 별도 검토 단계에서 채우므로 접수 시점에는 비워 둔다.
        this.processedBy = null;
        this.processedAt = null;
    }

    /**
     * 운영자 검토를 기다리는 접수 상태의 댓글 신고를 생성한다.
     *
     * <p>본인 댓글 신고와 중복 신고 차단은 서비스가 담당하며 여기서는 필수 값만 확인한다.
     *
     * @param comment 신고 대상 댓글
     * @param reporter 신고자
     * @param reason 신고 사유
     * @param detail 상세 설명이며 없으면 null
     * @param reportedAt 신고 접수 시각
     * @return 접수 상태로 초기화된 댓글 신고
     * @throws NullPointerException 댓글·신고자·사유·접수 시각 중 하나라도 null인 경우
     */
    public static CommentReport receive(PostComment comment, User reporter, String reason,
                                       String detail, LocalDateTime reportedAt) {
        return new CommentReport(comment, reporter, reason, detail, reportedAt);
    }
}
