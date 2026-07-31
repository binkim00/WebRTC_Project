package com.ssafy.backend.call.service;

import com.ssafy.backend.call.domain.CallEndReason;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.domain.CallSessionStatus;
import com.ssafy.backend.call.repository.CallSessionRepository;
import com.ssafy.backend.queue.redis.QueueRealtimeStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CallSessionExpirationServiceTest {

    private static final Long CALL_SESSION_ID = 100L;
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Instant FIXED_INSTANT = Instant.parse("2026-07-28T02:00:00Z");

    private CallSessionRepository callSessionRepository;
    private CallSessionFinalizer finalizer;
    private QueueRealtimeStore realtimeStore;
    private CallSessionExpirationService service;
    private CallSession callSession;
    private LocalDateTime now;

    /** 만료 종료 서비스와 활성 통화 mock을 구성한다. */
    @BeforeEach
    void setUp() {
        callSessionRepository = mock(CallSessionRepository.class);
        finalizer = mock(CallSessionFinalizer.class);
        realtimeStore = mock(QueueRealtimeStore.class);
        service = new CallSessionExpirationService(
                callSessionRepository,
                finalizer,
                realtimeStore,
                Clock.fixed(FIXED_INSTANT, SEOUL)
        );
        callSession = mock(CallSession.class);
        now = LocalDateTime.ofInstant(FIXED_INSTANT, SEOUL);
        when(callSessionRepository.findEndContextById(CALL_SESSION_ID))
                .thenReturn(Optional.of(callSession));
        when(callSession.getId()).thenReturn(CALL_SESSION_ID);
        when(callSession.getStatus()).thenReturn(CallSessionStatus.ACTIVE);
    }

    /** 통화 제한 시각이 지나면 재접속 상태보다 TIMEOUT을 우선 적용하는지 검증한다. */
    @Test
    void endsCallWhenCallDurationExpires() {
        when(callSession.getEndsAt()).thenReturn(now);

        service.endIfExpired(CALL_SESSION_ID);

        verify(finalizer).end(callSession, now, CallEndReason.TIMEOUT, null);
    }

    /** 팬의 60초 재접속 유예가 지나면 FAN_LEFT 사유로 종료하는지 검증한다. */
    @Test
    void endsCallWhenFanReconnectWindowExpires() {
        when(callSession.getEndsAt()).thenReturn(now.plusMinutes(1));
        when(callSession.getReconnectAllowedUntil()).thenReturn(now);
        when(realtimeStore.getDisconnectRole(CALL_SESSION_ID)).thenReturn("FAN");

        service.endIfExpired(CALL_SESSION_ID);

        verify(finalizer).end(callSession, now, CallEndReason.FAN_LEFT, null);
    }
}
