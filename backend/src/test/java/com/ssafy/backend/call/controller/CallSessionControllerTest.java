package com.ssafy.backend.call.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.call.domain.CallEndReason;
import com.ssafy.backend.call.domain.CallSessionStatus;
import com.ssafy.backend.call.dto.CallSessionEndResponse;
import com.ssafy.backend.call.dto.CallSessionStatusResponse;
import com.ssafy.backend.call.dto.ForceEndCallRequest;
import com.ssafy.backend.call.service.CallSessionService;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CallSessionControllerTest {

    /** 통화 세션 식별자와 인증 사용자를 상태 조회 서비스에 전달하는지 검증한다. */
    @Test
    void delegatesCallStatusQuery() {
        CallSessionService service = mock(CallSessionService.class);
        CallSessionController controller = new CallSessionController(service);
        AuthenticatedUser principal = new AuthenticatedUser(11L, UserRole.FAN);
        LocalDateTime now = LocalDateTime.of(2026, 7, 28, 11, 0);
        CallSessionStatusResponse expected = new CallSessionStatusResponse(
                100L, CallSessionStatus.ACTIVE, now.minusSeconds(10), now.plusSeconds(50),
                null, now, 50L, null, null, "ko", "ko");
        when(service.getStatus(100L, principal)).thenReturn(expected);

        ApiResponse<CallSessionStatusResponse> response =
                controller.getStatus(100L, principal);

        verify(service).getStatus(100L, principal);
        assertThat(response.success()).isTrue();
        assertThat(response.data()).isSameAs(expected);
    }

    /** 강제 종료 사유와 인증 사용자를 종료 서비스에 전달하는지 검증한다. */
    @Test
    void delegatesForceEndCommand() {
        CallSessionService service = mock(CallSessionService.class);
        CallSessionController controller = new CallSessionController(service);
        AuthenticatedUser principal = new AuthenticatedUser(13L, UserRole.MANAGER);
        ForceEndCallRequest request = new ForceEndCallRequest("운영상 즉시 종료");
        LocalDateTime endedAt = LocalDateTime.of(2026, 7, 28, 11, 0);
        CallSessionEndResponse expected = new CallSessionEndResponse(
                100L, CallSessionStatus.ENDED, endedAt, CallEndReason.FORCED);
        when(service.forceEnd(100L, request.reason(), principal)).thenReturn(expected);

        ApiResponse<CallSessionEndResponse> response =
                controller.forceEnd(100L, request, principal);

        verify(service).forceEnd(100L, request.reason(), principal);
        assertThat(response.success()).isTrue();
        assertThat(response.data()).isSameAs(expected);
    }
}
