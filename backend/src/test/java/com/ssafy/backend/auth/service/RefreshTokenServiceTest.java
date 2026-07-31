package com.ssafy.backend.auth.service;

import com.ssafy.backend.auth.dto.LoginResponse;
import com.ssafy.backend.auth.dto.RefreshTokenRequest;
import com.ssafy.backend.auth.exception.InvalidRefreshTokenException;
import com.ssafy.backend.auth.jwt.IssuedTokens;
import com.ssafy.backend.auth.jwt.JwtTokenProvider;
import com.ssafy.backend.auth.jwt.RefreshTokenPrincipal;
import com.ssafy.backend.auth.jwt.TokenSessionStore;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.domain.UserStatus;
import com.ssafy.backend.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

/** Refresh Token 검증, 회전과 재사용 차단 동작을 검증한다. */
class RefreshTokenServiceTest {
    private UserRepository userRepository;
    private JwtTokenProvider jwtTokenProvider;
    private TokenSessionStore tokenSessionStore;
    private RefreshTokenService service;

    /** 독립된 mock 의존성으로 Refresh Token 서비스를 구성한다. */
    @BeforeEach
    void setUp() {
        userRepository = mock(UserRepository.class);
        jwtTokenProvider = mock(JwtTokenProvider.class);
        tokenSessionStore = mock(TokenSessionStore.class);
        service = new RefreshTokenService(userRepository, jwtTokenProvider, tokenSessionStore);
    }

    /** 현재 Refresh Token을 새 토큰 쌍으로 회전하고 Redis 세션을 교체하는지 검증한다. */
    @Test
    void rotatesCurrentRefreshTokenAndReplacesSession() {
        User user = activeUser();
        when(jwtTokenProvider.parseRefreshToken("current-refresh"))
                .thenReturn(new RefreshTokenPrincipal(1L));
        when(tokenSessionStore.isCurrentRefreshToken(1L, "current-refresh")).thenReturn(true);
        when(userRepository.findById(1L)).thenReturn(Optional.of(user));
        when(jwtTokenProvider.issue(user)).thenReturn(new IssuedTokens("new-access", "new-refresh", 3600));

        LoginResponse response = service.refresh(new RefreshTokenRequest("current-refresh"));

        assertThat(response.accessToken()).isEqualTo("new-access");
        assertThat(response.refreshToken()).isEqualTo("new-refresh");
        verify(tokenSessionStore).save(1L, "new-access", "new-refresh");
    }

    /** 회전으로 교체된 이전 Refresh Token의 재사용을 거부하는지 검증한다. */
    @Test
    void rejectsRefreshTokenThatIsNotInCurrentSession() {
        when(jwtTokenProvider.parseRefreshToken("old-refresh"))
                .thenReturn(new RefreshTokenPrincipal(1L));
        when(tokenSessionStore.isCurrentRefreshToken(1L, "old-refresh")).thenReturn(false);

        assertThatThrownBy(() -> service.refresh(new RefreshTokenRequest("old-refresh")))
                .isInstanceOf(InvalidRefreshTokenException.class);
        verifyNoInteractions(userRepository);
        verify(jwtTokenProvider, never()).issue(any());
    }

    /** 재발급 응답 작성에 필요한 활성 사용자 mock을 생성한다. */
    private User activeUser() {
        User user = mock(User.class);
        when(user.getId()).thenReturn(1L);
        when(user.getStatus()).thenReturn(UserStatus.ACTIVE);
        when(user.getRole()).thenReturn(UserRole.FAN);
        when(user.getNickname()).thenReturn("melly");
        return user;
    }
}
