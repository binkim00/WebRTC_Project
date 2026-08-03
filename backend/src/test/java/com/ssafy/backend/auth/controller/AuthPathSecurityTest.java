package com.ssafy.backend.auth.controller;

import com.ssafy.backend.auth.jwt.JwtAuthenticationEntryPoint;
import com.ssafy.backend.auth.jwt.JwtAuthenticationFilter;
import com.ssafy.backend.auth.jwt.JwtTokenProvider;
import com.ssafy.backend.auth.jwt.RevokedAccessTokenStore;
import com.ssafy.backend.auth.jwt.TokenSessionStore;
import com.ssafy.backend.auth.service.LoginService;
import com.ssafy.backend.auth.service.LogoutService;
import com.ssafy.backend.auth.service.RefreshTokenService;
import com.ssafy.backend.auth.service.SignupService;
import com.ssafy.backend.auth.support.DeviceTokenService;
import com.ssafy.backend.common.security.RestAccessDeniedHandler;
import com.ssafy.backend.config.SecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 토큰 재발급 경로를 명세(AUTH-003)의 {@code /api/v1/auth/reissue}로 옮긴 결과를 검증한다.
 *
 * <p>이전 경로 {@code /api/v1/auth/refresh}가 계속 공개 상태로 남아 있으면
 * 명세와 실제 계약이 다시 어긋나므로 회귀 방지 목적으로 함께 확인한다.
 */
@WebMvcTest(AuthController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        JwtAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class
})
class AuthPathSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private SignupService signupService;

    @MockitoBean
    private LoginService loginService;

    @MockitoBean
    private LogoutService logoutService;

    @MockitoBean
    private RefreshTokenService refreshTokenService;

    @MockitoBean
    private DeviceTokenService deviceTokenService;

    @MockitoBean
    private JwtTokenProvider jwtTokenProvider;

    @MockitoBean
    private RevokedAccessTokenStore revokedAccessTokenStore;

    @MockitoBean
    private TokenSessionStore tokenSessionStore;

    /**
     * 명세 경로가 비로그인 요청에도 열려 있어 검증 단계까지 도달하는지 확인한다.
     *
     * <p>본문이 비어 있으므로 인증이 아니라 요청 값 검증에서 HTTP 400으로 거부되어야 한다.
     * 401이 나오면 {@code permitAll} 규칙이 새 경로에 적용되지 않았다는 뜻이다.
     */
    @Test
    void allowsUnauthenticatedAccessToSpecifiedReissuePath() throws Exception {
        mockMvc.perform(post("/api/v1/auth/reissue")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(refreshTokenService);
    }

    /** 이전 경로가 더 이상 공개 엔드포인트로 남아 있지 않은지 검증한다. */
    @Test
    void rejectsRemovedRefreshPath() throws Exception {
        mockMvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"refreshToken":"current-refresh"}
                                """))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(refreshTokenService);
    }
}
