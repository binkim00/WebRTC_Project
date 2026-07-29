package com.ssafy.backend.queue.dto;

import com.ssafy.backend.queue.domain.QueueEntryStatus;

import java.time.LocalDateTime;

/** 팬이 대기열에 처음 입장한 결과를 반환한다. */
public record QueueEnterResponse(
        Long queueEntryId,
        int position,
        QueueEntryStatus status,
        LocalDateTime enteredAt,
        long aheadCount,
        long estimatedWaitSec
) {
}
