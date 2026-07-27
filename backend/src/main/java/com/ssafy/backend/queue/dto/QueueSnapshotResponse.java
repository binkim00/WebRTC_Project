package com.ssafy.backend.queue.dto;

import com.ssafy.backend.queue.domain.QueueDisplayStatus;

import java.time.LocalDateTime;

/** 참가자에게 제공할 현재 대기열 상태 스냅샷이다. */
public record QueueSnapshotResponse(
        Long queueEntryId,
        int position,
        long aheadCount,
        long estimatedWaitSec,
        QueueDisplayStatus displayStatus,
        int callAttemptCount,
        LocalDateTime calledAt,
        boolean canEnterCall
) {
}
