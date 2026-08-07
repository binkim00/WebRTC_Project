package com.ssafy.backend.call.dto;

import com.ssafy.backend.call.domain.CallEndReason;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.domain.CallSessionStatus;

import java.time.LocalDateTime;

/**
 * 종료된 통화 세션의 최종 상태를 전달한다.
 *
 * @param callSessionId 통화 세션 식별자
 * @param status 종료된 통화 상태
 * @param endedAt 실제 종료 시각
 * @param endReason 통화 종료 사유
 */
public record CallSessionEndResponse(
        Long callSessionId,
        CallSessionStatus status,
        LocalDateTime endedAt,
        CallEndReason endReason
) {

    /**
     * 종료 처리가 완료된 엔티티를 API 응답으로 변환한다.
     *
     * @param callSession 종료된 통화 세션
     * @return 최종 종료 정보 응답
     */
    public static CallSessionEndResponse from(CallSession callSession) {
        return new CallSessionEndResponse(
                callSession.getId(),
                callSession.getStatus(),
                callSession.getEndedAt(),
                callSession.getEndReason()
        );
    }
}
