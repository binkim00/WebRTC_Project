package com.ssafy.backend.auth.jwt;

import com.ssafy.backend.auth.exception.InvalidAccessTokenException;
import com.ssafy.backend.user.domain.UserRole;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** JWT 인증 필터의 SecurityContext 등록, 실패 응답과 토큰 없는 요청 처리를 단위 검증한다. */
class JwtAuthenticationFilterTest {
    private JwtTokenProvider tokenProvider;
    private RevokedAccessTokenStore revokedAccessTokenStore;
    private TokenSessionStore tokenSessionStore;
    private JwtAuthenticationFilter filter;

    /** 토큰 검증기를 mock으로 교체한 필터를 각 테스트 전에 생성한다. */
    @BeforeEach
        void setUp() {
        tokenProvider = mock(JwtTokenProvider.class);
        revokedAccessTokenStore = mock(RevokedAccessTokenStore.class);
        tokenSessionStore = mock(TokenSessionStore.class);
        when(tokenSessionStore.isCurrentAccessToken(anyLong(), anyString())).thenReturn(true);
        filter = new JwtAuthenticationFilter(
                tokenProvider,
                revokedAccessTokenStore,
                tokenSessionStore,
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

    /** 새 로그인으로 교체된 이전 Access Token이 현재 세션 검증에서 차단되는지 확인한다. */
    @Test
    void rejectsAccessTokenThatIsNotInCurrentSession() throws Exception {
        when(tokenProvider.parseAccessToken("old-access-token"))
                .thenReturn(new AuthenticatedUser(1L, UserRole.FAN));
        when(tokenSessionStore.isCurrentAccessToken(1L, "old-access-token")).thenReturn(false);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/health");
        request.addHeader("Authorization", "Bearer old-access-token");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(401);
        verify(chain, never()).doFilter(any(), any());
    }

    /** Redis 조회 장애 시 인증 필터 체인을 진행하지 않고 예외를 전파하는지 검증한다. */
    @Test
    void blocksAuthenticationWhenRedisLookupFails() throws Exception {
        DataAccessResourceFailureException failure =
                new DataAccessResourceFailureException("Redis unavailable");
        when(revokedAccessTokenStore.isRevoked("access-token")).thenThrow(failure);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/health");
        request.addHeader("Authorization", "Bearer access-token");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        assertThatThrownBy(() -> filter.doFilter(request, response, chain))
                .isSameAs(failure);
        verifyNoInteractions(tokenProvider);
        verify(chain, never()).doFilter(any(), any());
    }

    /** 현재 세션 Redis 조회 장애도 인증 우회 없이 호출부로 전파되는지 검증한다. */
    @Test
    void blocksAuthenticationWhenSessionLookupFails() throws Exception {
        DataAccessResourceFailureException failure =
                new DataAccessResourceFailureException("Redis unavailable");
        when(tokenProvider.parseAccessToken("access-token"))
                .thenReturn(new AuthenticatedUser(1L, UserRole.FAN));
        when(tokenSessionStore.isCurrentAccessToken(1L, "access-token")).thenThrow(failure);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/health");
        request.addHeader("Authorization", "Bearer access-token");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        assertThatThrownBy(() -> filter.doFilter(request, response, chain))
                .isSameAs(failure);
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
        verifyNoInteractions(tokenProvider, revokedAccessTokenStore, tokenSessionStore);
    }
}
