package com.ssafy.backend.call.service;

import com.ssafy.backend.call.repository.CallSessionRepository;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CallSessionExpirationSchedulerTest {

    private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    private static final Instant INSTANT = Instant.parse("2026-07-28T02:00:00Z");
    private static final long CONNECT_TIMEOUT_SEC = 60L;

    /** 만료 후보 식별자를 각각 잠금 기반 종료 서비스에 위임하는지 검증한다. */
    @Test
    void delegatesEveryExpiredCallCandidate() {
        LocalDateTime now = LocalDateTime.ofInstant(INSTANT, ZONE);
        CallSessionRepository repository = mock(CallSessionRepository.class);
        CallSessionExpirationService expirationService =
                mock(CallSessionExpirationService.class);
        when(repository.findExpiredActiveIds(now)).thenReturn(List.of(100L, 101L));
        CallSessionExpirationScheduler scheduler = scheduler(repository, expirationService);

        scheduler.endExpiredCalls();

        verify(expirationService).endIfExpired(100L);
        verify(expirationService).endIfExpired(101L);
    }

    /**
     * 한 건이 실패해도 남은 만료 후보를 계속 마감하는지 검증한다.
     *
     * <p>여기서 루프가 끊기면 뒤에 있던 통화가 마감되지 않고, 통화가 끝나지 않은 팬미팅은
     * 대기열이 막혀 다음 팬을 호출할 수 없다.
     */
    @Test
    void continuesExpirationSweepAfterFailure() {
        LocalDateTime now = LocalDateTime.ofInstant(INSTANT, ZONE);
        CallSessionRepository repository = mock(CallSessionRepository.class);
        CallSessionExpirationService expirationService =
                mock(CallSessionExpirationService.class);
        when(repository.findExpiredActiveIds(now)).thenReturn(List.of(100L, 101L));
        doThrow(new IllegalStateException("대기열 상태 충돌"))
                .when(expirationService).endIfExpired(100L);
        CallSessionExpirationScheduler scheduler = scheduler(repository, expirationService);

        scheduler.endExpiredCalls();

        verify(expirationService).endIfExpired(101L);
    }

    /** 연결 대기 시간이 지난 후보를 기준 시각으로 조회해 각각 위임하는지 검증한다. */
    @Test
    void delegatesEveryConnectTimeoutCandidate() {
        LocalDateTime threshold =
                LocalDateTime.ofInstant(INSTANT, ZONE).minusSeconds(CONNECT_TIMEOUT_SEC);
        CallSessionRepository repository = mock(CallSessionRepository.class);
        CallSessionExpirationService expirationService =
                mock(CallSessionExpirationService.class);
        when(repository.findTimedOutConnectingIds(threshold)).thenReturn(List.of(200L, 201L));
        CallSessionExpirationScheduler scheduler = scheduler(repository, expirationService);

        scheduler.failTimedOutConnectingCalls();

        verify(expirationService).failIfConnectTimedOut(200L);
        verify(expirationService).failIfConnectTimedOut(201L);
    }

    /** 한 건이 실패해도 남은 연결 대기 후보를 계속 처리하는지 검증한다. */
    @Test
    void continuesConnectTimeoutSweepAfterFailure() {
        LocalDateTime threshold =
                LocalDateTime.ofInstant(INSTANT, ZONE).minusSeconds(CONNECT_TIMEOUT_SEC);
        CallSessionRepository repository = mock(CallSessionRepository.class);
        CallSessionExpirationService expirationService =
                mock(CallSessionExpirationService.class);
        when(repository.findTimedOutConnectingIds(threshold)).thenReturn(List.of(200L, 201L));
        doThrow(new IllegalStateException("대기열 상태 충돌"))
                .when(expirationService).failIfConnectTimedOut(200L);
        CallSessionExpirationScheduler scheduler = scheduler(repository, expirationService);

        scheduler.failTimedOutConnectingCalls();

        verify(expirationService).failIfConnectTimedOut(201L);
    }

    /**
     * 고정 시계와 연결 대기 시간을 적용한 스케줄러를 만든다.
     *
     * @param repository 통화 세션 저장소 mock
     * @param expirationService 만료 종료 서비스 mock
     * @return 테스트용 스케줄러
     */
    private CallSessionExpirationScheduler scheduler(
            CallSessionRepository repository, CallSessionExpirationService expirationService
    ) {
        return new CallSessionExpirationScheduler(
                repository, expirationService, Clock.fixed(INSTANT, ZONE), CONNECT_TIMEOUT_SEC);
    }
}
