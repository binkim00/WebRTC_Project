package com.ssafy.backend.queue.dto;

import com.ssafy.backend.queue.domain.QueueEntryStatus;

/** 참가자에게 제공할 현재 대기열 상태 스냅샷이다. */
public record QueueSnapshotResponse(
        Long fanMeetingId,
        Long queueEntryId,
        int queuePosition,
        long peopleAhead,
        long estimatedWaitSeconds,
        QueueEntryStatus status,
        boolean called
) {
}
