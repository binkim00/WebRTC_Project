package com.ssafy.backend.call.service;

import com.ssafy.backend.call.repository.CallSessionRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDateTime;

/** 종료 시각이 지난 통화 후보를 주기적으로 찾아 트랜잭션 종료 서비스에 위임한다. */
@Component
public class CallSessionExpirationScheduler {

    private final CallSessionRepository callSessionRepository;
    private final CallSessionExpirationService expirationService;
    private final Clock clock;

    /**
     * 만료 후보 저장소와 개별 종료 처리 서비스를 주입받는다.
     *
     * @param callSessionRepository 통화 세션 저장소
     * @param expirationService 잠금 기반 만료 종료 서비스
     * @param clock 서버 기준 시각 제공자
     */
    public CallSessionExpirationScheduler(
            CallSessionRepository callSessionRepository,
            CallSessionExpirationService expirationService,
            Clock clock
    ) {
        this.callSessionRepository = callSessionRepository;
        this.expirationService = expirationService;
        this.clock = clock;
    }

    /** 통화 제한 시간 또는 재접속 유예가 지난 활성 세션을 순차적으로 종료한다. */
    @Scheduled(fixedDelayString = "${app.call.expiration-check-delay-ms:1000}")
    public void endExpiredCalls() {
        for (Long callSessionId : callSessionRepository.findExpiredActiveIds(
                LocalDateTime.now(clock))) {
            expirationService.endIfExpired(callSessionId);
        }
    }
}
