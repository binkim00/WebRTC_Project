package com.ssafy.backend.queue.dto;

import com.ssafy.backend.queue.domain.QueueChangeRequestStatus;

import java.time.LocalDateTime;

/**
 * 매니저 순번 관리 화면에 표시할 순서 변경 요청 항목이다.
 *
 * @param requestId 순서 변경 요청 식별자
 * @param fanId 요청한 팬 사용자 식별자
 * @param nickname 요청한 팬 닉네임
 * @param profileImageUrl 요청한 팬 프로필 이미지 주소
 * @param requestReason 순서 미루기 요청 사유
 * @param requestedAt 요청 접수 시각
 * @param previousPosition 요청 당시 대기 순번
 * @param status 요청 처리 상태
 */
public record QueueChangeRequestSummaryResponse(
        Long requestId,
        Long fanId,
        String nickname,
        String profileImageUrl,
        String requestReason,
        LocalDateTime requestedAt,
        Integer previousPosition,
        QueueChangeRequestStatus status
) {
}
