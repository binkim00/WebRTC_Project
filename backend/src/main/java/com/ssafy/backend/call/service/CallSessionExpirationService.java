package com.ssafy.backend.call.service;

import com.ssafy.backend.call.domain.CallEndReason;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.domain.CallSessionStatus;
import com.ssafy.backend.call.repository.CallSessionRepository;
import com.ssafy.backend.queue.redis.QueueRealtimeStore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

/** 통화 제한 시간과 재접속 유예가 지난 활성 세션을 종료한다. */
@Service
public class CallSessionExpirationService {

    private static final String FAN_ROLE = "FAN";
    private static final String HOST_ROLE = "INFLUENCER";

    private final CallSessionRepository callSessionRepository;
    private final CallSessionFinalizer finalizer;
    private final QueueRealtimeStore realtimeStore;
    private final Clock clock;
    private final long connectTimeoutSec;

    /**
     * 만료 세션 조회와 공통 종료 처리에 필요한 의존성을 주입받는다.
     *
     * @param callSessionRepository 통화 세션 저장소
     * @param finalizer 공통 통화 종료 처리기
     * @param realtimeStore 마지막 이탈 역할 저장소
     * @param clock 서버 기준 시각 제공자
     * @param connectTimeoutSec 호출 후 연결을 기다리는 최대 시간(초)
     */
    public CallSessionExpirationService(
            CallSessionRepository callSessionRepository,
            CallSessionFinalizer finalizer,
            QueueRealtimeStore realtimeStore,
            Clock clock,
            @Value("${app.call.connect-timeout-sec:60}") long connectTimeoutSec
    ) {
        this.callSessionRepository = callSessionRepository;
        this.finalizer = finalizer;
        this.realtimeStore = realtimeStore;
        this.clock = clock;
        this.connectTimeoutSec = connectTimeoutSec;
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
     * 세션을 쓰기 잠금으로 다시 확인하고 연결 시간이 초과된 대기 통화만 실패 처리한다.
     *
     * <p>연결 대기 세션은 자동으로 정리되지 않으면 팬미팅당 한 건만 허용되는 활성 세션 자리를
     * 계속 차지해 다음 참가자 호출을 막으므로, 시간이 지나면 노쇼로 마감해 자리를 비운다.
     *
     * <p>다만 팬이 이미 Room에 들어와 기다리고 있으면 마감하지 않는다. 이 마감은 대기열을
     * 노쇼로 바꾸는데, 늦는 쪽이 인플루언서인 상황에서 노쇼가 되는 것은 응답한 팬이다. 노쇼는
     * 되돌릴 수 있는 상태가 아니어서 그 팬은 통화 기회를 잃는다. 그래서 팬이 접속해 있는 동안은
     * 인플루언서의 입장을 계속 기다리고, 통화가 성사될 수 없다고 판단되면 운영자가 강제 종료로
     * 자리를 비운다.
     *
     * @param callSessionId 연결 시간 초과 후보 통화 세션 식별자
     */
    @Transactional
    public void failIfConnectTimedOut(Long callSessionId) {
        CallSession callSession = callSessionRepository.findEndContextById(callSessionId)
                .orElse(null);
        if (callSession == null || callSession.getStatus() != CallSessionStatus.CONNECTING) {
            return;
        }

        LocalDateTime now = LocalDateTime.now(clock);
        LocalDateTime createdAt = callSession.getCreatedAt();
        if (createdAt == null || createdAt.plusSeconds(connectTimeoutSec).isAfter(now)) {
            return;
        }
        if (realtimeStore.isFanConnected(callSessionId)) {
            return;
        }
        finalizer.failConnecting(callSession, now, CallEndReason.CONNECTION_FAILED, null);
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
