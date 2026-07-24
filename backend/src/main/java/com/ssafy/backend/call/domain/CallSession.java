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
}
