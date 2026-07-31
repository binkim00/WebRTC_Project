package com.ssafy.backend.call.service;

import com.ssafy.backend.call.repository.CallSessionRepository;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CallSessionExpirationSchedulerTest {

    /** 만료 후보 식별자를 각각 잠금 기반 종료 서비스에 위임하는지 검증한다. */
    @Test
    void delegatesEveryExpiredCallCandidate() {
        ZoneId zone = ZoneId.of("Asia/Seoul");
        Instant instant = Instant.parse("2026-07-28T02:00:00Z");
        LocalDateTime now = LocalDateTime.ofInstant(instant, zone);
        CallSessionRepository repository = mock(CallSessionRepository.class);
        CallSessionExpirationService expirationService =
                mock(CallSessionExpirationService.class);
        when(repository.findExpiredActiveIds(now)).thenReturn(List.of(100L, 101L));
        CallSessionExpirationScheduler scheduler = new CallSessionExpirationScheduler(
                repository, expirationService, Clock.fixed(instant, zone));

        scheduler.endExpiredCalls();

        verify(expirationService).endIfExpired(100L);
        verify(expirationService).endIfExpired(101L);
    }
}
