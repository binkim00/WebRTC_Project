package com.ssafy.backend.queue.domain;

import com.ssafy.backend.common.entity.BaseTimeEntity;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.participant.domain.Participant;
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
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 팬미팅 참가자의 현재 대기 순서와 상태를 저장하는 엔티티다.
 */
@Getter
@Entity
@Table(name = "queue_entries")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class QueueEntry extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "queue_entry_id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "meeting_id", nullable = false)
    private FanMeeting meeting;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "participant_id", nullable = false, unique = true)
    private Participant participant;

    @Column(name = "queue_position", nullable = false)
    private Integer queuePosition;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private QueueEntryStatus status;

    @Column(name = "recall_count", nullable = false)
    private Integer recallCount;

    @Column(name = "entered_at")
    private LocalDateTime enteredAt;

    @Column(name = "called_at")
    private LocalDateTime calledAt;

    @Column(name = "no_show_at")
    private LocalDateTime noShowAt;

    /** 참가자 배정 순번을 사용하는 초기 대기열 항목을 생성한다. */
    public static QueueEntry create(FanMeeting meeting, Participant participant) {
        QueueEntry entry = new QueueEntry();
        entry.meeting = meeting;
        entry.participant = participant;
        entry.queuePosition = participant.getAssignedOrder();
        entry.status = QueueEntryStatus.NOT_ENTERED;
        entry.recallCount = 0;
        return entry;
    }

    /** 아직 입장하지 않은 참가자를 대기 상태로 전환한다. */
    public void enter(LocalDateTime enteredAt) {
        requireStatus(QueueEntryStatus.NOT_ENTERED);
        this.status = QueueEntryStatus.WAITING;
        this.enteredAt = enteredAt;
    }

    /** 대기 중인 참가자를 호출 상태로 전환한다. */
    public void call(LocalDateTime calledAt) {
        requireStatus(QueueEntryStatus.WAITING);
        this.status = QueueEntryStatus.CALLED;
        this.calledAt = calledAt;
    }

    /**
     * 호출 중인 참가자의 재호출 횟수와 호출 시각을 팬미팅별 허용 횟수 안에서 갱신한다.
     *
     * @param calledAt 재호출 시각
     * @param maxRecallCount 팬미팅에 설정된 최대 재호출 횟수
     */
    public void recall(LocalDateTime calledAt, int maxRecallCount) {
        requireStatus(QueueEntryStatus.CALLED);
        if (maxRecallCount < 0 || recallCount >= maxRecallCount) {
            throw new IllegalStateException("재호출 가능 횟수를 초과했습니다.");
        }
        this.recallCount++;
        this.calledAt = calledAt;
    }

    /**
     * 최초 호출과 재호출을 합한 누적 호출 시도 횟수를 반환한다.
     *
     * @return 아직 호출되지 않았으면 0, 호출된 이후에는 최초 호출을 포함한 누적 횟수
     */
    public int getCallAttemptCount() {
        return calledAt == null ? 0 : recallCount + 1;
    }

    /** 호출에 응답하지 않은 참가자를 노쇼로 처리한다. */
    public void markNoShow(LocalDateTime noShowAt) {
        requireStatus(QueueEntryStatus.CALLED);
        this.status = QueueEntryStatus.NO_SHOW;
        this.noShowAt = noShowAt;
    }

    /** 호출된 참가자를 통화 중 상태로 전환한다. */
    public void startCall() {
        if (status == QueueEntryStatus.IN_CALL) {
            return;
        }
        requireStatus(QueueEntryStatus.CALLED);
        this.status = QueueEntryStatus.IN_CALL;
    }

    /** 호출 또는 통화 중인 참가자를 완료 상태로 전환한다. */
    public void complete() {
        if (status == QueueEntryStatus.DONE) {
            return;
        }
        if (status != QueueEntryStatus.CALLED && status != QueueEntryStatus.IN_CALL) {
            throw new IllegalStateException("완료할 수 없는 대기열 상태입니다.");
        }
        this.status = QueueEntryStatus.DONE;
    }

    /** 팬미팅 종료 또는 운영자 조치로 미완료 대기열 항목을 제거 상태로 전환한다. */
    public void remove() {
        if (status == QueueEntryStatus.REMOVED
                || status == QueueEntryStatus.DONE
                || status == QueueEntryStatus.NO_SHOW) {
            return;
        }
        this.status = QueueEntryStatus.REMOVED;
    }

    /** 대기 전 또는 대기 중인 참가자의 순서를 변경한다. */
    public void changePosition(int newPosition) {
        if (status != QueueEntryStatus.NOT_ENTERED && status != QueueEntryStatus.WAITING) {
            throw new IllegalStateException("순서를 변경할 수 없는 대기열 상태입니다.");
        }
        this.queuePosition = newPosition;
    }

    /** 예상한 현재 상태가 아니면 상태 전이를 거부한다. */
    private void requireStatus(QueueEntryStatus expected) {
        if (status != expected) {
            throw new IllegalStateException("현재 대기열 상태에서는 요청을 처리할 수 없습니다.");
        }
    }
}
