package com.ssafy.backend.auth.jwt;

import com.ssafy.backend.auth.exception.InvalidAccessTokenException;
import com.ssafy.backend.user.domain.UserRole;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** JWT 인증 필터의 SecurityContext 등록, 실패 응답과 토큰 없는 요청 처리를 단위 검증한다. */
class JwtAuthenticationFilterTest {
    private JwtTokenProvider tokenProvider;
    private RevokedAccessTokenStore revokedAccessTokenStore;
    private JwtAuthenticationFilter filter;

    /** 토큰 검증기를 mock으로 교체한 필터를 각 테스트 전에 생성한다. */
    @BeforeEach
        void setUp() {
        tokenProvider = mock(JwtTokenProvider.class);
        revokedAccessTokenStore = mock(RevokedAccessTokenStore.class);
        filter = new JwtAuthenticationFilter(
                tokenProvider,
                revokedAccessTokenStore,
                new JwtAuthenticationEntryPoint()
        );
    }

    /** 테스트 간 인증 정보가 공유되지 않도록 SecurityContext를 정리한다. */
    @AfterEach
        void clearContext() {
        SecurityContextHolder.clearContext();
    }

    /** 유효한 Access Token의 사용자 ID와 역할 권한이 필터 체인 동안 등록되는지 검증한다. */
    @Test
        void registersUserIdRoleAndAuthorityDuringFilterChain() throws Exception {
        when(tokenProvider.parseAccessToken("access-token"))
                .thenReturn(new AuthenticatedUser(1L, UserRole.FAN));
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/health");
        request.addHeader("Authorization", "Bearer access-token");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);
        AtomicReference<Authentication> captured = new AtomicReference<>();
        doAnswer(invocation -> {
            captured.set(SecurityContextHolder.getContext().getAuthentication());
            return null;
        }).when(chain).doFilter(any(), any());

        filter.doFilter(request, response, chain);

        assertThat(captured.get()).isNotNull();
        assertThat(captured.get().getPrincipal()).isEqualTo(new AuthenticatedUser(1L, UserRole.FAN));
        assertThat(captured.get().getAuthorities())
                .extracting(Object::toString)
                .containsExactly("ROLE_FAN");
        assertThat(captured.get().getCredentials()).isNull();
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    /** 로그아웃으로 폐기된 Access Token이 파싱 전에 ProblemDetail 401로 차단되는지 검증한다. */
    @Test
    void returnsProblemDetailForRevokedAccessToken() throws Exception {
        when(revokedAccessTokenStore.isRevoked("revoked-token")).thenReturn(true);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/health");
        request.addHeader("Authorization", "Bearer revoked-token");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(response.getContentAsString()).contains("Invalid or expired access token.");
        verifyNoInteractions(tokenProvider);
        verify(chain, never()).doFilter(any(), any());
    }

    /** Refresh Token을 포함한 잘못된 토큰이 ProblemDetail 401로 차단되는지 검증한다. */
    @Test
        void returnsProblemDetailForInvalidOrRefreshToken() throws Exception {
        when(tokenProvider.parseAccessToken("refresh-token"))
                .thenThrow(new InvalidAccessTokenException());
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/health");
        request.addHeader("Authorization", "Bearer refresh-token");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(response.getContentType()).startsWith("application/problem+json");
        assertThat(response.getContentAsString()).contains("Invalid or expired access token.");
        verify(chain, never()).doFilter(any(), any());
    }

    /** Bearer 헤더가 없는 공개 요청은 인증 시도 없이 다음 필터로 전달되는지 검증한다. */
    @Test
        void continuesWithoutAuthenticationWhenBearerHeaderIsAbsent() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/health");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        verify(chain).doFilter(request, response);
        verifyNoInteractions(tokenProvider, revokedAccessTokenStore);
    }
}
