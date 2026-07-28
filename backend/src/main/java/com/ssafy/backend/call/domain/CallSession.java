package com.ssafy.backend.call.domain;

import com.ssafy.backend.common.entity.BaseTimeEntity;
import com.ssafy.backend.queue.domain.QueueEntry;
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
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 팬별 일대일 영상통화 세션과 종료 결과를 저장하는 엔티티다.
 */
@Getter
@Entity
@Table(name = "call_sessions")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CallSession extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "call_session_id", nullable = false)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "queue_entry_id", nullable = false, unique = true)
    private QueueEntry queueEntry;

    @Column(name = "room_id", nullable = false, length = 255)
    private String roomId;

    @Column(name = "fan_lang", nullable = false, length = 20)
    private String fanLanguage;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private CallSessionStatus status;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "ends_at")
    private LocalDateTime endsAt;

    @Column(name = "ended_at")
    private LocalDateTime endedAt;

    @Column(name = "reconnect_allowed_until")
    private LocalDateTime reconnectAllowedUntil;

    @Enumerated(EnumType.STRING)
    @Column(name = "end_reason", length = 40)
    private CallEndReason endReason;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ended_by_user_id")
    private User endedBy;

    /**
     * 호출된 팬의 입장을 기다리는 초기 영상통화 세션을 생성한다.
     *
     * @param queueEntry 통화 대상 대기열 항목
     * @param roomId 팬미팅에서 공통으로 사용할 LiveKit Room 식별자
     * @param fanLanguage 통화 중 고정해서 사용할 팬 언어 코드
     * @return 연결 대기 상태의 영상통화 세션
     */
    public static CallSession createConnecting(
            QueueEntry queueEntry, String roomId, String fanLanguage
    ) {
        CallSession callSession = new CallSession();
        callSession.queueEntry = queueEntry;
        callSession.roomId = roomId;
        callSession.fanLanguage = fanLanguage;
        callSession.status = CallSessionStatus.CONNECTING;
        return callSession;
    }

    /**
     * 팬과 인플루언서의 접속이 확인된 세션을 실제 통화 중 상태로 전환한다.
     *
     * @param startedAt LiveKit에서 양측 접속이 확인된 시각
     * @param durationSec 팬미팅 운영 설정의 통화 제한 시간(초)
     * @throws IllegalStateException 연결 대기 상태가 아니거나 통화 시간이 올바르지 않은 경우
     */
    public void activate(LocalDateTime startedAt, int durationSec) {
        if (status == CallSessionStatus.ACTIVE) {
            return;
        }
        if (status != CallSessionStatus.CONNECTING) {
            throw new IllegalStateException("시작할 수 없는 통화 세션 상태입니다.");
        }
        if (durationSec <= 0) {
            throw new IllegalStateException("통화 시간은 0초보다 커야 합니다.");
        }
        this.status = CallSessionStatus.ACTIVE;
        this.startedAt = startedAt;
        this.endsAt = startedAt.plusSeconds(durationSec);
    }
}
