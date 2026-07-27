package com.ssafy.backend.queue.dto;

import com.ssafy.backend.queue.domain.QueueEntryStatus;

import java.time.LocalDateTime;

/**
 * 참가자 호출 또는 재호출 처리 결과다.
 *
 * @param queueEntryId 대기열 항목 식별자
 * @param status 호출 후 대기열 상태
 * @param calledAt 가장 최근 호출 시각
 * @param callAttemptCount 최초 호출을 포함한 누적 호출 시도 횟수
 * @param callSessionId 팬과 인플루언서의 영상통화 세션 식별자
 * @param notificationSent 호출 알림 전송 여부
 */
public record QueueCallResponse(
        Long queueEntryId,
        QueueEntryStatus status,
        LocalDateTime calledAt,
        int callAttemptCount,
        Long callSessionId,
        boolean notificationSent
) {
}
