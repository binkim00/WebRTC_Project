package com.ssafy.backend.auth.controller;

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
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 이메일 인증 엔드포인트의 URL 단위 권한 규칙을 검증한다.
 *
 * <p>확인 경로는 메일을 다른 브라우저에서 열 수 있어 비로그인도 통과해야 하고,
 * 발송·재발송은 현재 로그인 사용자의 이메일을 대상으로 하므로 인증을 요구해야 한다.
 */
@WebMvcTest(EmailVerificationController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        JwtAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class
})
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

    /** 비로그인 요청도 인증 확인 경로에 도달하는지 검증한다. */
    @Test
    void allowsUnauthenticatedConfirm() throws Exception {
        mockMvc.perform(post("/api/v1/auth/email-verifications/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"token":"raw-token"}
                                """))
                .andExpect(status().isOk());

        verify(emailVerificationService).confirm(anyString(), anyString());
    }

    /** 토큰이 비어 있으면 인증이 아니라 요청 값 검증에서 거부되는지 검증한다. */
    @Test
    void rejectsBlankTokenWithBadRequest() throws Exception {
        mockMvc.perform(post("/api/v1/auth/email-verifications/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"token":"  "}
                                """))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(emailVerificationService);
    }

    /** 비로그인 발송 요청을 401로 거부하는지 검증한다. */
    @Test
    void rejectsUnauthenticatedSend() throws Exception {
        mockMvc.perform(post("/api/v1/auth/email-verifications"))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(emailVerificationService);
    }

    /** 비로그인 재발송 요청을 401로 거부하는지 검증한다. */
    @Test
    void rejectsUnauthenticatedResend() throws Exception {
        mockMvc.perform(post("/api/v1/auth/email-verifications/resend"))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(emailVerificationService);
    }

    /** 로그인 사용자의 발송 요청은 서비스까지 전달되는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void allowsAuthenticatedSend() throws Exception {
        mockMvc.perform(post("/api/v1/auth/email-verifications"))
                .andExpect(status().isOk());
    }

    /** 팬이 아닌 역할도 자신의 이메일을 인증할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void allowsAuthenticatedSendForOtherRoles() throws Exception {
        mockMvc.perform(post("/api/v1/auth/email-verifications"))
                .andExpect(status().isOk());
    }
}
