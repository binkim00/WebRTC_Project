package com.ssafy.backend.application.dto;

import java.time.LocalDateTime;

/**
 * 응모 결과 공개 처리 결과를 전달한다.
 *
 * @param publishedAt 결과를 공개한 시각
 * @param notificationCount 생성된 결과 알림 수
 * @param resultStatus 공개 완료를 나타내는 결과 상태
 */
public record ResultPublishResponse(
        LocalDateTime publishedAt,
        long notificationCount,
        String resultStatus
) {

    /** 결과 공개가 완료된 상태값이다. */
    public static final String PUBLISHED = "PUBLISHED";

    /**
     * 공개 시각과 알림 수로 공개 완료 응답을 생성한다.
     *
     * @param publishedAt 결과를 공개한 시각
     * @param notificationCount 생성된 결과 알림 수
     * @return 결과 상태가 공개 완료로 채워진 응답
     */
    public static ResultPublishResponse published(LocalDateTime publishedAt, long notificationCount) {
        return new ResultPublishResponse(publishedAt, notificationCount, PUBLISHED);
    }
}
