package com.ssafy.backend.call.service;

import com.ssafy.backend.call.domain.CallEndReason;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.domain.CallSessionStatus;
import com.ssafy.backend.call.repository.CallSessionRepository;
import com.ssafy.backend.queue.redis.QueueRealtimeStore;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

/** 통화 제한 시간과 재접속 유예가 지난 활성 세션을 종료한다. */
@Service
public class CallSessionExpirationService {

    private static final String FAN_ROLE = "fan";
    private static final String HOST_ROLE = "host";

    private final CallSessionRepository callSessionRepository;
    private final CallSessionFinalizer finalizer;
    private final QueueRealtimeStore realtimeStore;
    private final Clock clock;

    /**
     * 만료 세션 조회와 공통 종료 처리에 필요한 의존성을 주입받는다.
     *
     * @param callSessionRepository 통화 세션 저장소
     * @param finalizer 공통 통화 종료 처리기
     * @param realtimeStore 마지막 이탈 역할 저장소
     * @param clock 서버 기준 시각 제공자
     */
    public CallSessionExpirationService(
            CallSessionRepository callSessionRepository,
            CallSessionFinalizer finalizer,
            QueueRealtimeStore realtimeStore,
            Clock clock
    ) {
        this.callSessionRepository = callSessionRepository;
        this.finalizer = finalizer;
        this.realtimeStore = realtimeStore;
        this.clock = clock;
    }

    /**
     * 세션을 쓰기 잠금으로 다시 확인하고 실제 만료된 활성 통화만 종료한다.
     *
     * @param callSessionId 만료 후보 통화 세션 식별자
     */
    @Transactional
    public void endIfExpired(Long callSessionId) {
        CallSession callSession = callSessionRepository.findEndContextById(callSessionId)
                .orElse(null);
        if (callSession == null || callSession.getStatus() != CallSessionStatus.ACTIVE) {
            return;
        }

        LocalDateTime now = LocalDateTime.now(clock);
        CallEndReason endReason = resolveEndReason(callSession, now);
        if (endReason != null) {
            finalizer.end(callSession, now, endReason, null);
        }
    }

    /**
     * 통화 제한 시간을 우선 적용하고 재접속 만료 시 이탈 역할에 맞는 사유를 결정한다.
     *
     * @param callSession 만료 여부를 확인할 활성 통화
     * @param now 서버 기준 현재 시각
     * @return 종료해야 하면 종료 사유, 아직 유효하면 null
     */
    private CallEndReason resolveEndReason(CallSession callSession, LocalDateTime now) {
        if (callSession.getEndsAt() != null && !callSession.getEndsAt().isAfter(now)) {
            return CallEndReason.TIMEOUT;
        }
        if (callSession.getReconnectAllowedUntil() == null
                || callSession.getReconnectAllowedUntil().isAfter(now)) {
            return null;
        }
        String disconnectedRole = realtimeStore.getDisconnectRole(callSession.getId());
        if (FAN_ROLE.equals(disconnectedRole)) {
            return CallEndReason.FAN_LEFT;
        }
        if (HOST_ROLE.equals(disconnectedRole)) {
            return CallEndReason.INFLUENCER_LEFT;
        }
        return CallEndReason.CONNECTION_FAILED;
    }
}
