package com.ssafy.backend.livekit.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.livekit.dto.LiveKitAccessTokenResponse;
import com.ssafy.backend.livekit.service.LiveKitAccessTokenService;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CallSessionAccessTokenControllerTest {

    /**
     * 경로의 callSessionId와 JWT principal을 서비스에 전달하고 공통 성공 응답으로 감싸는지 검증한다.
     */
    @Test
    void delegatesTokenIssueWithAuthenticatedPrincipal() {
        LiveKitAccessTokenService service = mock(LiveKitAccessTokenService.class);
        CallSessionAccessTokenController controller = new CallSessionAccessTokenController(service);
        AuthenticatedUser principal = new AuthenticatedUser(11L, UserRole.FAN);
        LiveKitAccessTokenResponse expected = new LiveKitAccessTokenResponse(
                "ws://localhost:7880",
                "livekit-token",
                LocalDateTime.of(2026, 7, 27, 12, 15),
                null
        );
        when(service.issue(100L, principal)).thenReturn(expected);

        ApiResponse<LiveKitAccessTokenResponse> response =
                controller.issueAccessToken(100L, principal);

        verify(service).issue(100L, principal);
        assertThat(response.success()).isTrue();
        assertThat(response.data()).isSameAs(expected);
    }
}
