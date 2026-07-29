package com.ssafy.backend.queue.dto;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 팬미팅 운영자용 대기열 조회 응답입니다.
 *
 * @param currentCall 현재 진행 중인 통화 정보
 * @param entries 대기열 참가자 목록
 */
public record QueueManagementResponse(
        CurrentCall currentCall,
        List<Entry> entries
) {

    /**
     * 현재 진행 중인 통화 정보입니다.
     *
     * @param callSessionId 통화 세션 식별자
     * @param participantId 참가자 식별자
     * @param nickname 팬 닉네임
     * @param startedAt 통화 시작 시각
     * @param endsAt 통화 종료 예정 시각
     */
    public record CurrentCall(
            Long callSessionId,
            Long participantId,
            String nickname,
            LocalDateTime startedAt,
            LocalDateTime endsAt
    ) {
    }

    /**
     * 운영자 화면에 표시할 대기열 항목입니다.
     *
     * @param queueEntryId 대기열 항목 식별자
     * @param participantId 참가자 식별자
     * @param fanId 팬 사용자 식별자
     * @param nickname 팬 닉네임
     * @param profileImageUrl 팬 프로필 이미지 주소
     * @param position 대기 순번
     * @param status 대기열 상태
     * @param callAttemptCount 호출 시도 횟수
     * @param enteredAt 대기열 입장 시각
     */
    public record Entry(
            Long queueEntryId,
            Long participantId,
            Long fanId,
            String nickname,
            String profileImageUrl,
            int position,
            String status,
            int callAttemptCount,
            LocalDateTime enteredAt
    ) {
    }
}
