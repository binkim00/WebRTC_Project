package com.ssafy.backend.auth.jwt;

import com.ssafy.backend.config.jwt.JwtConfig;
import com.ssafy.backend.config.jwt.JwtProperties;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import javax.crypto.SecretKey;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** 실제 JWT 발급기와 인증 필터를 연결해 Access·Refresh Token 처리 차이를 통합 검증한다. */
class JwtAuthenticationIntegrationTest {
    /** 통합 테스트가 남긴 인증 정보를 제거한다. */
    @AfterEach
        void clearContext() {
        SecurityContextHolder.clearContext();
    }

    /** 실제 발급된 Access Token은 인증하고 같은 발급기의 Refresh Token은 거부하는지 검증한다. */
    @Test
        void authenticatesIssuedAccessTokenButRejectsIssuedRefreshToken() throws Exception {
        JwtProperties properties = new JwtProperties(
                "0123456789abcdef0123456789abcdef", 3600, 1209600
        );
        JwtConfig config = new JwtConfig();
        SecretKey key = config.jwtSecretKey(properties);
        JwtTokenProvider provider = new JwtTokenProvider(
                config.jwtEncoder(key),
                config.jwtDecoder(key),
                properties,
                Clock.fixed(Instant.now(), ZoneOffset.UTC)
        );
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(
                provider, mock(RevokedAccessTokenStore.class), new JwtAuthenticationEntryPoint()
        );
        User user = User.createActive(
                "melly01", "melly@example.com", "bcrypt", "melly",
                UserRole.MANAGER, PreferredLanguage.KOREAN
        );
        ReflectionTestUtils.setField(user, "id", 7L);
        IssuedTokens tokens = provider.issue(user);

        AtomicReference<Authentication> captured = new AtomicReference<>();
        FilterChain chain = mock(FilterChain.class);
        doAnswer(invocation -> {
            captured.set(SecurityContextHolder.getContext().getAuthentication());
            return null;
        }).when(chain).doFilter(any(), any());

        MockHttpServletRequest accessRequest = bearerRequest(tokens.accessToken());
        MockHttpServletResponse accessResponse = new MockHttpServletResponse();
        filter.doFilter(accessRequest, accessResponse, chain);
        assertThat(captured.get().getPrincipal()).isEqualTo(new AuthenticatedUser(7L, UserRole.MANAGER));
        assertThat(captured.get().getAuthorities()).extracting(Object::toString)
                .containsExactly("ROLE_MANAGER");

        MockHttpServletRequest refreshRequest = bearerRequest(tokens.refreshToken());
        MockHttpServletResponse refreshResponse = new MockHttpServletResponse();
        filter.doFilter(refreshRequest, refreshResponse, mock(FilterChain.class));
        assertThat(refreshResponse.getStatus()).isEqualTo(401);
        assertThat(refreshResponse.getContentAsString()).contains("Invalid or expired access token.");
    }

    /** Authorization Bearer 헤더를 포함한 mock HTTP 요청을 생성한다. */
    private MockHttpServletRequest bearerRequest(String token) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/health");
        request.addHeader("Authorization", "Bearer " + token);
        return request;
    }
}
