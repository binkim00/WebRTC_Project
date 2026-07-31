package com.ssafy.backend.notification.domain;

/**
 * 사용자에게 전달되는 알림의 유형이다.
 */
public enum NotificationType {
    APPLICATION_RESULT,
    QUEUE_ORDER_ASSIGNED,
    QUEUE_CHANGE_RESULT,
    ENTER_NOW,
    MEETING_CHANGED,
    MEETING_CANCELED
}
