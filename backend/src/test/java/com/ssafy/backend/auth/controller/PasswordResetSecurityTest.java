package com.ssafy.backend.auth.controller;

import com.ssafy.backend.auth.dto.PasswordResetConfirmResponse;
import com.ssafy.backend.auth.dto.PasswordResetSendResponse;
import com.ssafy.backend.auth.jwt.JwtAuthenticationEntryPoint;
import com.ssafy.backend.auth.jwt.JwtAuthenticationFilter;
import com.ssafy.backend.auth.jwt.JwtTokenProvider;
import com.ssafy.backend.auth.jwt.RevokedAccessTokenStore;
import com.ssafy.backend.auth.jwt.TokenSessionStore;
import com.ssafy.backend.auth.service.PasswordResetService;
import com.ssafy.backend.common.security.RestAccessDeniedHandler;
import com.ssafy.backend.config.SecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 비밀번호 재설정 API의 URL 단위 인증 정책을 검증한다. */
@WebMvcTest(PasswordResetController.class)
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, JwtAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class})
class PasswordResetSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private PasswordResetService passwordResetService;

    @MockitoBean
    private JwtTokenProvider jwtTokenProvider;

    @MockitoBean
    private RevokedAccessTokenStore revokedAccessTokenStore;

    @MockitoBean
    private TokenSessionStore tokenSessionStore;

    /** 비밀번호를 잊은 사용자가 로그인 없이 재설정 메일을 요청할 수 있는지 검증한다. */
    @Test
    void allowsAnonymousResetRequest() throws Exception {
        when(passwordResetService.requestReset(any())).thenReturn(PasswordResetSendResponse.of(
                "fan@example.com",
                LocalDateTime.of(2026, 8, 7, 10, 30),
                LocalDateTime.of(2026, 8, 7, 10, 1),
                null));

        mockMvc.perform(post("/api/v1/auth/password-reset")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"fan@example.com"}
                                """))
                .andExpect(status().isOk());
    }

    /** 메일 링크를 통해 들어온 사용자가 로그인 없이 새 비밀번호를 확정할 수 있는지 검증한다. */
    @Test
    void allowsAnonymousResetConfirm() throws Exception {
        when(passwordResetService.confirmReset(any())).thenReturn(PasswordResetConfirmResponse.of(
                "fan-login", LocalDateTime.of(2026, 8, 7, 10, 5)));

        mockMvc.perform(post("/api/v1/auth/password-reset/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"token":"raw-token","newPassword":"newPass123"}
                                """))
                .andExpect(status().isOk());
    }

    /**
     * 열린 경로여도 요청 값 검증은 그대로 동작하는지 확인한다.
     *
     * <p>인증(401)이 아니라 검증(400)으로 거부되어야 {@code permitAll} 규칙이 적용된 것이다.
     */
    @Test
    void stillValidatesRequestBody() throws Exception {
        mockMvc.perform(post("/api/v1/auth/password-reset")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(passwordResetService);
    }
}
