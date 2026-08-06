package com.ssafy.backend.queue.dto;

import com.ssafy.backend.queue.domain.QueueDisplayStatus;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * 참가자에게 제공할 현재 대기열 상태 스냅샷이다.
 *
 * <p>{@code lastChangeReason}은 순서가 바뀐 시점 팬의 계정 선호 언어로 굳은 문장이다. 대기 화면의
 * 화면 언어는 계정 선호 언어와 따로 움직이므로, 화면이 자기 언어로 다시 만들 수 있도록
 * {@code lastChangeKey}와 {@code lastChangeArgs}를 함께 내려보낸다. 사전에 키가 없으면 화면은
 * {@code lastChangeReason}을 그대로 보여 주면 된다.
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
 * @param lastChangeKey 최근 사유 번역에 쓸 사전 키이며 조정 이력이 없거나 예전 기록이면 null
 * @param lastChangeArgs 최근 사유 자리표시자 이름별 값이며 담을 값이 없으면 null
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
        String lastChangeKey,
        Map<String, String> lastChangeArgs,
        LocalDateTime lastChangedAt
) {
}
