package com.ssafy.backend.queue.domain;

import com.ssafy.backend.user.domain.User;
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
 * 참가자가 요청한 대기 순서 변경과 처리 결과를 저장하는 엔티티다.
 */
@Getter
@Entity
@Table(name = "queue_change_requests")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class QueueChangeRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "queue_change_request_id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "queue_entry_id", nullable = false)
    private QueueEntry queueEntry;

    @Column(name = "request_reason", nullable = false, columnDefinition = "TEXT")
    private String requestReason;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private QueueChangeRequestStatus status;

    @Column(name = "requested_at", nullable = false)
    private LocalDateTime requestedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "processed_by_user_id")
    private User processedBy;

    @Column(name = "processed_at")
    private LocalDateTime processedAt;

    @Column(name = "previous_queue_position")
    private Integer previousQueuePosition;

    @Column(name = "changed_queue_position")
    private Integer changedQueuePosition;

    /** 대기 순서 변경 요청을 대기 상태로 생성한다. */
    public static QueueChangeRequest create(QueueEntry queueEntry, String reason, LocalDateTime requestedAt) {
        QueueChangeRequest request = new QueueChangeRequest();
        request.queueEntry = queueEntry;
        request.requestReason = reason;
        request.status = QueueChangeRequestStatus.PENDING;
        request.requestedAt = requestedAt;
        request.previousQueuePosition = queueEntry.getQueuePosition();
        return request;
    }

    /** 대기 중인 순서 변경 요청을 승인 결과와 함께 완료한다. */
    public void approve(User processedBy, int changedPosition, LocalDateTime processedAt) {
        requirePending();
        this.status = QueueChangeRequestStatus.APPROVED;
        this.processedBy = processedBy;
        this.processedAt = processedAt;
        this.changedQueuePosition = changedPosition;
    }

    /** 대기 중인 순서 변경 요청을 거절 처리한다. */
    public void reject(User processedBy, LocalDateTime processedAt) {
        requirePending();
        this.status = QueueChangeRequestStatus.REJECTED;
        this.processedBy = processedBy;
        this.processedAt = processedAt;
    }

    /** 이미 처리된 순서 변경 요청의 중복 처리를 차단한다. */
    private void requirePending() {
        if (status != QueueChangeRequestStatus.PENDING) {
            throw new IllegalStateException("이미 처리된 순서 변경 요청입니다.");
        }
    }
}
