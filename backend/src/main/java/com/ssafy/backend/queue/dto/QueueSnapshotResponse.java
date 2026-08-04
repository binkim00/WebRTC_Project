package com.ssafy.backend.queue.dto;

import com.ssafy.backend.queue.domain.QueueDisplayStatus;

import java.time.LocalDateTime;

/**
 * 참가자에게 제공할 현재 대기열 상태 스냅샷이다.
 *
 * @param queueEntryId 대기열 항목 식별자
 * @param position 현재 대기 순번
 * @param aheadCount 앞에서 대기 중인 참가자 수
 * @param estimatedWaitSec 예상 대기 시간(초)
 * @param displayStatus 팬 화면에 표시할 대기 상태
 * @param callAttemptCount 최초 호출을 포함한 누적 호출 횟수
 * @param calledAt 마지막 호출 시각
 * @param callSessionId 입장 또는 재접속할 통화 세션 식별자
 * @param canEnterCall 현재 통화 화면에 입장할 수 있는지 여부
 * @param lastChangeReason 운영자 순서 조정으로 순번이 바뀐 최근 사유이며 조정 이력이 없으면 null
 * @param lastChangedAt 최근 순번 조정이 반영된 시각이며 조정 이력이 없으면 null
 */
public record QueueSnapshotResponse(
        Long queueEntryId,
        int position,
        long aheadCount,
        long estimatedWaitSec,
        QueueDisplayStatus displayStatus,
        int callAttemptCount,
        LocalDateTime calledAt,
        Long callSessionId,
        boolean canEnterCall,
        String lastChangeReason,
        LocalDateTime lastChangedAt
) {
}
