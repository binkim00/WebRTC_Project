package com.ssafy.backend.auth.controller;

import com.ssafy.backend.auth.dto.EmailVerificationStatusResponse;
import com.ssafy.backend.auth.jwt.JwtAuthenticationEntryPoint;
import com.ssafy.backend.auth.jwt.JwtAuthenticationFilter;
import com.ssafy.backend.auth.jwt.JwtTokenProvider;
import com.ssafy.backend.auth.jwt.RevokedAccessTokenStore;
import com.ssafy.backend.auth.jwt.TokenSessionStore;
import com.ssafy.backend.auth.service.EmailVerificationService;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 이메일 인증 API의 URL 단위 인증 정책을 검증한다. */
@WebMvcTest(EmailVerificationController.class)
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, JwtAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class})
class EmailVerificationSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private EmailVerificationService emailVerificationService;

    @MockitoBean
    private JwtTokenProvider jwtTokenProvider;

    @MockitoBean
    private RevokedAccessTokenStore revokedAccessTokenStore;

    @MockitoBean
    private TokenSessionStore tokenSessionStore;

    /** JWT 없이도 인증 링크 토큰 확인 요청이 서비스까지 전달되는지 검증한다. */
    @Test
    void allowsAnonymousEmailVerificationConfirm() throws Exception {
        when(emailVerificationService.confirm(any())).thenReturn(new EmailVerificationStatusResponse(
                "fan@example.com", true, LocalDateTime.of(2026, 8, 5, 10, 0)));

        mockMvc.perform(post("/api/v1/auth/email-verifications/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"token":"valid-token"}
                                """))
                .andExpect(status().isOk());
    }

    /** 이메일 인증 발송 요청은 JWT 없이 접근할 수 없는지 검증한다. */
    @Test
    void rejectsAnonymousEmailVerificationSend() throws Exception {
        mockMvc.perform(post("/api/v1/auth/email-verifications"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(emailVerificationService);
    }

    /** 이메일 인증 재발송 요청은 JWT 없이 접근할 수 없는지 검증한다. */
    @Test
    void rejectsAnonymousEmailVerificationResend() throws Exception {
        mockMvc.perform(post("/api/v1/auth/email-verifications/resend"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(emailVerificationService);
    }

    /** 이메일 인증 상태 조회는 JWT 없이 접근할 수 없는지 검증한다. */
    @Test
    void rejectsAnonymousEmailVerificationStatus() throws Exception {
        mockMvc.perform(get("/api/v1/auth/email-verifications"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(emailVerificationService);
    }
}
