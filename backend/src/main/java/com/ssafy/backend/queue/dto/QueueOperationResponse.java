package com.ssafy.backend.queue.dto;

import com.ssafy.backend.queue.domain.QueueEntryStatus;

import java.time.LocalDateTime;

/** 운영자가 변경한 대기열 항목의 결과를 반환한다. */
public record QueueOperationResponse(
        Long queueEntryId,
        Long participantId,
        int position,
        QueueEntryStatus status,
        int callAttemptCount,
        LocalDateTime calledAt,
        LocalDateTime noShowAt
) {
}
