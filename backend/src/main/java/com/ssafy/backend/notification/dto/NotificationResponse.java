package com.ssafy.backend.notification.dto;

import com.ssafy.backend.notification.domain.Notification;
import com.ssafy.backend.notification.domain.NotificationType;

import java.time.LocalDateTime;

/**
 * 사용자 알림 목록에 노출할 정보를 전달한다.
 *
 * @param notificationId 알림 식별자
 * @param type 알림 유형
 * @param title 알림 제목
 * @param message 알림 본문
 * @param meetingId 관련 팬미팅 식별자
 * @param readAt 읽은 시각
 * @param createdAt 생성 시각
 */
public record NotificationResponse(
        Long notificationId,
        NotificationType type,
        String title,
        String message,
        Long meetingId,
        LocalDateTime readAt,
        LocalDateTime createdAt
) {

    /**
     * 알림 엔티티를 목록 응답으로 변환한다.
     *
     * @param notification 변환할 알림
     * @return 알림 목록 응답
     */
    public static NotificationResponse from(Notification notification) {
        return new NotificationResponse(
                notification.getId(),
                notification.getType(),
                notification.getTitle(),
                notification.getMessage(),
                notification.getMeeting() == null ? null : notification.getMeeting().getId(),
                notification.getReadAt(),
                notification.getCreatedAt()
        );
    }
}
