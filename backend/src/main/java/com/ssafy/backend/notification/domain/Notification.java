package com.ssafy.backend.notification.domain;

import com.ssafy.backend.common.converter.StringMapJsonConverter;
import com.ssafy.backend.common.entity.BaseCreatedTimeEntity;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.notification.support.NotificationContent;
import com.ssafy.backend.user.domain.User;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
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
import java.util.Map;
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

    @Column(name = "message_key", length = 80)
    private String messageKey;

    @Convert(converter = StringMapJsonConverter.class)
    @Column(name = "message_args", columnDefinition = "TEXT")
    private Map<String, String> messageArguments;

    @Column(name = "read_at")
    private LocalDateTime readAt;

    /**
     * 사용자에게 전달할 팬미팅 알림을 생성한다.
     *
     * <p>제목·본문은 만든 시점 수신자의 선호 언어로 고정되므로, 화면이 자기 언어로 다시 만들 수
     * 있도록 사전 키와 자리표시자 값도 함께 보관한다.
     *
     * @param user 알림 수신 사용자
     * @param meeting 관련 팬미팅
     * @param type 알림 유형
     * @param content 수신자 언어로 만든 문구와 번역 재료
     * @return 읽지 않은 상태로 생성된 알림
     */
    public static Notification create(User user, FanMeeting meeting, NotificationType type,
                                      NotificationContent content) {
        Objects.requireNonNull(content);
        Notification notification = new Notification();
        notification.user = Objects.requireNonNull(user);
        notification.meeting = meeting;
        notification.type = Objects.requireNonNull(type);
        notification.title = Objects.requireNonNull(content.title());
        notification.message = Objects.requireNonNull(content.message());
        notification.messageKey = content.messageKey();
        notification.messageArguments = content.messageArguments();
        return notification;
    }

    /**
     * 아직 읽지 않은 알림에 최초 확인 시각을 기록한다.
     *
     * @param readAt 사용자가 알림을 확인한 시각
     */
    public void markAsRead(LocalDateTime readAt) {
        if (this.readAt == null) {
            this.readAt = Objects.requireNonNull(readAt);
        }
    }
}
