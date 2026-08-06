package com.ssafy.backend.notification.dto;

import com.ssafy.backend.notification.domain.Notification;
import com.ssafy.backend.notification.domain.NotificationType;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * 사용자 알림 목록에 노출할 정보를 전달한다.
 *
 * <p>{@code title}·{@code message}는 알림을 만든 시점 수신자의 계정 선호 언어로 굳은 문장이다.
 * 화면 언어는 계정 선호 언어와 따로 움직이므로, 화면이 자기 언어로 다시 만들 수 있도록
 * {@code messageKey}와 {@code messageArgs}를 함께 내려보낸다. 사전에 키가 없으면 화면은
 * {@code message}를 그대로 보여 주면 된다.
 *
 * <p>제목은 {@code type}마다 하나로 정해져 있어 별도 키를 두지 않는다. 화면은 알림 유형으로
 * 제목 문구를 찾는다.
 *
 * @param notificationId 알림 식별자
 * @param type 알림 유형
 * @param title 알림 제목
 * @param message 알림 본문
 * @param messageKey 본문 번역에 쓸 사전 키이며 예전에 만든 알림은 null
 * @param messageArgs 본문 자리표시자 이름별 값이며 담을 값이 없으면 null
 * @param meetingId 관련 팬미팅 식별자
 * @param readAt 읽은 시각
 * @param createdAt 생성 시각
 */
public record NotificationResponse(
        Long notificationId,
        NotificationType type,
        String title,
        String message,
        String messageKey,
        Map<String, String> messageArgs,
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
                notification.getMessageKey(),
                notification.getMessageArguments(),
                notification.getMeeting() == null ? null : notification.getMeeting().getId(),
                notification.getReadAt(),
                notification.getCreatedAt()
        );
    }
}
