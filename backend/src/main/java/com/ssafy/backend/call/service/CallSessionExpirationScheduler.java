package com.ssafy.backend.call.service;

import com.ssafy.backend.call.repository.CallSessionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDateTime;

/** 종료 시각이 지난 통화 후보를 주기적으로 찾아 트랜잭션 종료 서비스에 위임한다. */
@Component
public class CallSessionExpirationScheduler {

    private static final Logger log =
            LoggerFactory.getLogger(CallSessionExpirationScheduler.class);

    private final CallSessionRepository callSessionRepository;
    private final CallSessionExpirationService expirationService;
    private final Clock clock;
    private final long connectTimeoutSec;

    /**
     * 만료 후보 저장소와 개별 종료 처리 서비스를 주입받는다.
     *
     * @param callSessionRepository 통화 세션 저장소
     * @param expirationService 잠금 기반 만료 종료 서비스
     * @param clock 서버 기준 시각 제공자
     * @param connectTimeoutSec 호출 후 연결을 기다리는 최대 시간(초)
     */
    public CallSessionExpirationScheduler(
            CallSessionRepository callSessionRepository,
            CallSessionExpirationService expirationService,
            Clock clock,
            @Value("${app.call.connect-timeout-sec:60}") long connectTimeoutSec
    ) {
        this.callSessionRepository = callSessionRepository;
        this.expirationService = expirationService;
        this.clock = clock;
        this.connectTimeoutSec = connectTimeoutSec;
    }

    /**
     * 통화 제한 시간 또는 재접속 유예가 지난 활성 세션을 순차적으로 종료한다.
     *
     * <p>한 건이 실패해도 나머지 건을 계속 처리하고, 다음 주기에 같은 건을 다시 시도한다.
     * 예외를 그대로 올리면 루프가 그 자리에서 끊기는데, 조회에 정렬이 없어 다음 주기에도 같은
     * 목록을 같은 순서로 받을 수 있다. 그러면 문제가 된 한 건 때문에 뒤에 있던 통화가 계속
     * 마감되지 못하고, 통화가 끝나지 않은 팬미팅은 대기열이 막혀 다음 팬을 호출할 수 없다.
     */
    @Scheduled(fixedDelayString = "${app.call.expiration-check-delay-ms:1000}")
    public void endExpiredCalls() {
        for (Long callSessionId : callSessionRepository.findExpiredActiveIds(
                LocalDateTime.now(clock))) {
            try {
                expirationService.endIfExpired(callSessionId);
            } catch (RuntimeException exception) {
                log.warn("통화 마감에 실패했습니다. 다음 주기에 다시 시도합니다. callSessionId={}",
                        callSessionId, exception);
            }
        }
    }

    /**
     * 호출 후 정해진 시간까지 연결되지 않은 대기 세션을 노쇼로 마감해 호출 자리를 비운다.
     *
     * <p>한 건이 실패해도 나머지 건을 계속 처리하고, 다음 주기에 같은 건을 다시 시도한다.
     */
    @Scheduled(fixedDelayString = "${app.call.connect-timeout-check-delay-ms:1000}")
    public void failTimedOutConnectingCalls() {
        LocalDateTime threshold = LocalDateTime.now(clock).minusSeconds(connectTimeoutSec);
        for (Long callSessionId : callSessionRepository.findTimedOutConnectingIds(threshold)) {
            try {
                expirationService.failIfConnectTimedOut(callSessionId);
            } catch (RuntimeException exception) {
                // 대기열 상태가 어긋난 한 건이 남은 건의 정리를 막지 않도록 기록만 남긴다.
                log.warn("연결 대기 통화 마감에 실패했습니다. 다음 주기에 다시 시도합니다. callSessionId={}",
                        callSessionId, exception);
            }
        }
    }
}
