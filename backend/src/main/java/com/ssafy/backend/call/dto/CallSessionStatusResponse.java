package com.ssafy.backend.call.dto;

import com.ssafy.backend.call.domain.CallEndReason;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.domain.CallSessionStatus;

import java.time.Duration;
import java.time.LocalDateTime;

/**
 * 서버 시각을 기준으로 통화 상태와 남은 시간을 전달한다.
 *
 * @param callSessionId 통화 세션 식별자
 * @param status 통화 세션 상태
 * @param startedAt 실제 통화 시작 시각
 * @param endsAt 예정 종료 시각
 * @param endedAt 실제 종료 시각
 * @param serverNow 응답을 생성한 서버 시각
 * @param remainingSec 남은 통화 시간(초)
 * @param reconnectAllowedUntil 재접속 허용 종료 시각
 * @param endReason 통화 종료 사유
 */
public record CallSessionStatusResponse(
        Long callSessionId,
        CallSessionStatus status,
        LocalDateTime startedAt,
        LocalDateTime endsAt,
        LocalDateTime endedAt,
        LocalDateTime serverNow,
        long remainingSec,
        LocalDateTime reconnectAllowedUntil,
        CallEndReason endReason
) {

    /**
     * 통화 세션과 서버 시각으로 상태 조회 응답을 생성한다.
     *
     * @param callSession 조회한 통화 세션
     * @param serverNow 응답 생성 시각
     * @return 음수가 되지 않도록 남은 시간이 계산된 응답
     */
    public static CallSessionStatusResponse from(
            CallSession callSession, LocalDateTime serverNow
    ) {
        long remainingSec = callSession.getEndsAt() == null
                ? 0L
                : Math.max(0L, Duration.between(serverNow, callSession.getEndsAt()).getSeconds());
        return new CallSessionStatusResponse(
                callSession.getId(),
                callSession.getStatus(),
                callSession.getStartedAt(),
                callSession.getEndsAt(),
                callSession.getEndedAt(),
                serverNow,
                remainingSec,
                callSession.getReconnectAllowedUntil(),
                callSession.getEndReason()
        );
    }
}
