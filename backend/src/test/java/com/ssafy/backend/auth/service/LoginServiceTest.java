package com.ssafy.backend.auth.service;

import com.ssafy.backend.auth.dto.LoginRequest;
import com.ssafy.backend.auth.dto.LoginResponse;
import com.ssafy.backend.auth.exception.AccountUnavailableException;
import com.ssafy.backend.auth.exception.InvalidCredentialsException;
import com.ssafy.backend.auth.exception.TooManyLoginAttemptsException;
import com.ssafy.backend.auth.jwt.IssuedTokens;
import com.ssafy.backend.auth.jwt.JwtTokenProvider;
import com.ssafy.backend.auth.jwt.TokenSessionStore;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.domain.UserStatus;
import com.ssafy.backend.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

/** 로그인 서비스의 인증, 상태 검증, 토큰 발급과 로그인 시각 갱신을 검증한다. */
class LoginServiceTest {
    private static final Clock CLOCK = Clock.fixed(
            Instant.parse("2026-07-23T03:00:00Z"), ZoneId.of("Asia/Seoul")
    );

    private UserRepository userRepository;
    private PasswordEncoder passwordEncoder;
    private JwtTokenProvider jwtTokenProvider;
    private TokenSessionStore tokenSessionStore;
    private LoginAttemptStore loginAttemptStore;
    private LoginService loginService;

    /** 각 테스트가 독립된 mock 의존성과 고정 서버 시각을 사용하도록 서비스를 구성한다. */
    @BeforeEach
        void setUp() {
        userRepository = mock(UserRepository.class);
        passwordEncoder = mock(PasswordEncoder.class);
        jwtTokenProvider = mock(JwtTokenProvider.class);
        tokenSessionStore = mock(TokenSessionStore.class);
        loginAttemptStore = mock(LoginAttemptStore.class);
        loginService = new LoginService(
                userRepository, passwordEncoder, jwtTokenProvider,
                tokenSessionStore, loginAttemptStore, CLOCK
        );
    }

    /** 로그인 ID를 정규화하고 토큰 발급 후에만 마지막 로그인 시각을 갱신하는지 검증한다. */
    @Test
        void authenticatesTrimmedLoginIdIssuesTokensAndUpdatesLastLoginAt() {
        User user = user(UserStatus.ACTIVE);
        when(userRepository.findByLoginId("melly01")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("password123", "bcrypt-hash")).thenReturn(true);
        when(jwtTokenProvider.issue(user)).thenReturn(new IssuedTokens("access", "refresh", 3600));

        LoginResponse response = loginService.login(new LoginRequest("  melly01  ", "password123"));

        assertThat(response).isEqualTo(new LoginResponse(
                "access", "refresh", 3600, 1L, UserRole.FAN, "melly"
        ));
        verify(user).updateLastLoginAt(LocalDateTime.of(2026, 7, 23, 12, 0));
        verify(tokenSessionStore).save(1L, "access", "refresh");
        verify(loginAttemptStore).clear("melly01");
    }

    /** 사용자 없음과 비밀번호 불일치가 같은 예외를 반환하고 성공 후처리를 하지 않는지 검증한다. */
    @Test
        void returnsSameFailureForUnknownUserAndWrongPasswordWithoutUpdatingLoginTime() {
        when(userRepository.findByLoginId("missing")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> loginService.login(new LoginRequest("missing", "password123")))
                .isInstanceOf(InvalidCredentialsException.class)
                .hasMessage("Invalid login ID or password.");

        User user = user(UserStatus.ACTIVE);
        when(userRepository.findByLoginId("melly01")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("wrong", "bcrypt-hash")).thenReturn(false);
        assertThatThrownBy(() -> loginService.login(new LoginRequest("melly01", "wrong")))
                .isInstanceOf(InvalidCredentialsException.class)
                .hasMessage("Invalid login ID or password.");

        verify(user, never()).updateLastLoginAt(any());
        verifyNoInteractions(jwtTokenProvider);
        verify(loginAttemptStore).recordFailure("missing");
        verify(loginAttemptStore).recordFailure("melly01");
    }

    /** 정지·탈퇴 계정이 토큰 발급이나 로그인 시각 갱신 없이 거부되는지 검증한다. */
    @ParameterizedTest
    @EnumSource(value = UserStatus.class, names = {"SUSPENDED", "WITHDRAWN"})
    void rejectsUnavailableAccountWithoutIssuingTokens(UserStatus status) {
        User user = user(status);
        when(userRepository.findByLoginId("melly01")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("password123", "bcrypt-hash")).thenReturn(true);

        assertThatThrownBy(() -> loginService.login(new LoginRequest("melly01", "password123")))
                .isInstanceOf(AccountUnavailableException.class)
                .hasMessage("This account is not available.");

        verify(user, never()).updateLastLoginAt(any());
        verifyNoInteractions(jwtTokenProvider);
    }

    /** 이미 실패 기준에 도달한 로그인 ID는 DB 조회 전에 차단하는지 검증한다. */
    @Test
    void rejectsBlockedLoginIdBeforeCredentialLookup() {
        when(loginAttemptStore.isBlocked("melly01")).thenReturn(true);

        assertThatThrownBy(() -> loginService.login(new LoginRequest("melly01", "password123")))
                .isInstanceOf(TooManyLoginAttemptsException.class);
        verifyNoInteractions(userRepository, passwordEncoder, jwtTokenProvider, tokenSessionStore);
    }

    /** 이번 인증 실패로 최대 횟수에 도달하면 즉시 임시 차단 예외를 반환하는지 검증한다. */
    @Test
    void blocksLoginWhenCurrentFailureReachesThreshold() {
        when(userRepository.findByLoginId("missing")).thenReturn(Optional.empty());
        when(loginAttemptStore.recordFailure("missing")).thenReturn(true);

        assertThatThrownBy(() -> loginService.login(new LoginRequest("missing", "password123")))
                .isInstanceOf(TooManyLoginAttemptsException.class);
    }

    /** 테스트에 필요한 필드만 응답하는 사용자 mock을 생성한다. */
    private User user(UserStatus status) {
        User user = mock(User.class);
        when(user.getId()).thenReturn(1L);
        when(user.getPassword()).thenReturn("bcrypt-hash");
        when(user.getNickname()).thenReturn("melly");
        when(user.getRole()).thenReturn(UserRole.FAN);
        when(user.getStatus()).thenReturn(status);
        return user;
    }
}
