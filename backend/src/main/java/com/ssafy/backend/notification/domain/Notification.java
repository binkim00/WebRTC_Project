package com.ssafy.backend.notification.domain;

import com.ssafy.backend.common.entity.BaseCreatedTimeEntity;
import com.ssafy.backend.meeting.domain.FanMeeting;
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
import java.util.Objects;

/**
 * 사용자에게 전달된 알림과 읽음 시각을 저장하는 엔티티다.
 */
@Getter
@Entity
@Table(name = "notifications")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Notification extends BaseCreatedTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "notification_id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "meeting_id")
    private FanMeeting meeting;

    @Enumerated(EnumType.STRING)
    @Column(name = "notification_type", nullable = false, length = 40)
    private NotificationType type;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "message", nullable = false, columnDefinition = "TEXT")
    private String message;

    @Column(name = "read_at")
    private LocalDateTime readAt;

    /**
     * 사용자에게 전달할 팬미팅 알림을 생성한다.
     *
     * @param user 알림 수신 사용자
     * @param meeting 관련 팬미팅
     * @param type 알림 유형
     * @param title 알림 제목
     * @param message 알림 본문
     * @return 읽지 않은 상태로 생성된 알림
     */
    public static Notification create(User user, FanMeeting meeting, NotificationType type,
                                      String title, String message) {
        Notification notification = new Notification();
        notification.user = Objects.requireNonNull(user);
        notification.meeting = meeting;
        notification.type = Objects.requireNonNull(type);
        notification.title = Objects.requireNonNull(title);
        notification.message = Objects.requireNonNull(message);
        return notification;
    }
}
