package com.ssafy.backend.notification.dto;

import com.ssafy.backend.notification.domain.Notification;

import java.time.LocalDateTime;

/**
 * 알림 읽음 처리 결과를 전달한다.
 *
 * @param notificationId 알림 식별자
 * @param readAt 최초로 읽은 시각
 */
public record NotificationReadResponse(Long notificationId, LocalDateTime readAt) {

    /**
     * 읽음 처리된 알림 엔티티를 응답으로 변환한다.
     *
     * @param notification 읽음 처리된 알림
     * @return 알림 읽음 처리 응답
     */
    public static NotificationReadResponse from(Notification notification) {
        return new NotificationReadResponse(notification.getId(), notification.getReadAt());
    }
}
