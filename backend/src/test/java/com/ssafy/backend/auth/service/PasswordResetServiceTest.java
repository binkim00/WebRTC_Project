package com.ssafy.backend.auth.service;

import com.ssafy.backend.auth.dto.PasswordResetConfirmRequest;
import com.ssafy.backend.auth.dto.PasswordResetConfirmResponse;
import com.ssafy.backend.auth.dto.PasswordResetRequest;
import com.ssafy.backend.auth.dto.PasswordResetSendResponse;
import com.ssafy.backend.auth.jwt.TokenSessionStore;
import com.ssafy.backend.auth.support.PasswordResetTokenStore;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class PasswordResetServiceTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 8, 7, 10, 0);

    private UserRepository userRepository;
    private PasswordResetTokenStore tokenStore;
    private PasswordResetMailSender mailSender;
    private PasswordResetRateLimiter rateLimiter;
    private PasswordEncoder passwordEncoder;
    private TokenSessionStore tokenSessionStore;
    private PasswordResetService passwordResetService;

    /** 각 테스트가 고정 시계와 새 mock으로 독립 실행되도록 협력 객체를 구성한다. */
    @BeforeEach
    void setUp() {
        userRepository = mock(UserRepository.class);
        tokenStore = mock(PasswordResetTokenStore.class);
        mailSender = mock(PasswordResetMailSender.class);
        rateLimiter = mock(PasswordResetRateLimiter.class);
        passwordEncoder = mock(PasswordEncoder.class);
        tokenSessionStore = mock(TokenSessionStore.class);
        when(rateLimiter.canSend(anyString())).thenReturn(true);
        when(rateLimiter.resendCooldown()).thenReturn(Duration.ofSeconds(60));

        PasswordResetPolicy policy = new PasswordResetPolicy(
                new MockEnvironment(), 1800, "http://localhost:5173/login", false);
        Clock clock = Clock.fixed(NOW.atZone(ZoneId.systemDefault()).toInstant(), ZoneId.systemDefault());
        passwordResetService = new PasswordResetService(userRepository, tokenStore, mailSender,
                rateLimiter, policy, passwordEncoder, tokenSessionStore, clock);
    }

    /** 가입된 이메일이면 토큰을 발급하고 재설정 링크를 발송하는지 확인한다. */
    @Test
    void sendsResetLinkToRegisteredEmail() {
        User user = activeUser(7L, "fan@example.com");
        when(userRepository.findByEmail("fan@example.com")).thenReturn(Optional.of(user));
        when(tokenStore.issue(eq(7L), any(Duration.class))).thenReturn("raw-token");

        PasswordResetSendResponse response = passwordResetService.requestReset(
                new PasswordResetRequest(" Fan@Example.com "));

        ArgumentCaptor<String> linkCaptor = ArgumentCaptor.forClass(String.class);
        verify(mailSender).send(eq(user), linkCaptor.capture(), eq(NOW.plusMinutes(30)));
        assertThat(linkCaptor.getValue()).isEqualTo("http://localhost:5173/login?resetToken=raw-token");
        assertThat(response.email()).isEqualTo("fan@example.com");
        assertThat(response.expiresAt()).isEqualTo(NOW.plusMinutes(30));
        assertThat(response.resendAvailableAt()).isEqualTo(NOW.plusMinutes(1));
        // 운영에서 토큰 원문이 응답으로 새지 않아야 한다.
        assertThat(response.devToken()).isNull();
        verify(rateLimiter).recordSend("fan@example.com");
    }

    /** 가입되지 않은 이메일도 발송한 것과 같은 응답을 돌려주는지 확인한다. */
    @Test
    void returnsSameResponseForUnknownEmail() {
        when(userRepository.findByEmail("nobody@example.com")).thenReturn(Optional.empty());

        PasswordResetSendResponse response = passwordResetService.requestReset(
                new PasswordResetRequest("nobody@example.com"));

        assertThat(response.email()).isEqualTo("nobody@example.com");
        assertThat(response.expiresAt()).isEqualTo(NOW.plusMinutes(30));
        verifyNoInteractions(mailSender);
        verifyNoInteractions(tokenStore);
        // 없는 주소로 훑는 비용도 같아지도록 발송 카운터는 동일하게 기록한다.
        verify(rateLimiter).recordSend("nobody@example.com");
    }

    /** 비밀번호로 로그인하지 않는 소셜 전용 계정에는 메일을 보내지 않는지 확인한다. */
    @Test
    void skipsSocialOnlyAccount() {
        User socialOnly = User.createSocialOnly("kakao_1", "social@example.com", "소셜",
                UserRole.FAN, PreferredLanguage.KOREAN);
        ReflectionTestUtils.setField(socialOnly, "id", 9L);
        when(userRepository.findByEmail("social@example.com")).thenReturn(Optional.of(socialOnly));

        passwordResetService.requestReset(new PasswordResetRequest("social@example.com"));

        verifyNoInteractions(mailSender);
        verifyNoInteractions(tokenStore);
    }

    /** 발송 빈도 제한에 걸리면 조회 없이 429로 거부하는지 확인한다. */
    @Test
    void rejectsWhenRateLimited() {
        when(rateLimiter.canSend("fan@example.com")).thenReturn(false);

        assertThatThrownBy(() -> passwordResetService.requestReset(
                new PasswordResetRequest("fan@example.com")))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.TOO_MANY_REQUESTS));
        verifyNoInteractions(userRepository);
        verifyNoInteractions(mailSender);
    }

    /** 메일 발송에 실패하면 아무도 쓸 수 없는 토큰을 남기지 않는지 확인한다. */
    @Test
    void discardsTokenWhenMailSendFails() {
        User user = activeUser(7L, "fan@example.com");
        when(userRepository.findByEmail("fan@example.com")).thenReturn(Optional.of(user));
        when(tokenStore.issue(eq(7L), any(Duration.class))).thenReturn("raw-token");
        org.mockito.Mockito.doThrow(new BusinessException(ErrorCode.PASSWORD_RESET_SEND_FAILED))
                .when(mailSender).send(any(), anyString(), any());

        assertThatThrownBy(() -> passwordResetService.requestReset(
                new PasswordResetRequest("fan@example.com")))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.PASSWORD_RESET_SEND_FAILED));
        verify(tokenStore).consume("raw-token");
    }

    /** 유효한 토큰으로 비밀번호를 바꾸고 토큰과 로그인 세션을 함께 정리하는지 확인한다. */
    @Test
    void confirmsResetAndClearsSession() {
        User user = activeUser(7L, "fan@example.com");
        when(tokenStore.findUserId("raw-token")).thenReturn(Optional.of(7L));
        when(userRepository.findById(7L)).thenReturn(Optional.of(user));
        when(passwordEncoder.encode("newPass123")).thenReturn("encoded-new");

        PasswordResetConfirmResponse response = passwordResetService.confirmReset(
                new PasswordResetConfirmRequest(" raw-token ", "newPass123"));

        assertThat(user.getPassword()).isEqualTo("encoded-new");
        assertThat(response.loginId()).isEqualTo("fan-login");
        assertThat(response.resetAt()).isEqualTo(NOW);
        verify(tokenStore).consume("raw-token");
        verify(tokenSessionStore).delete(7L);
        verify(rateLimiter).clear("fan@example.com");
    }

    /** 만료되었거나 위조된 토큰은 비밀번호를 바꾸지 않고 거부하는지 확인한다. */
    @Test
    void rejectsUnknownToken() {
        when(tokenStore.findUserId("bad-token")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> passwordResetService.confirmReset(
                new PasswordResetConfirmRequest("bad-token", "newPass123")))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.PASSWORD_RESET_TOKEN_INVALID));
        verify(tokenSessionStore, never()).delete(any());
    }

    /** 정책을 만족하지 않는 새 비밀번호는 토큰을 확인하기 전에 거부하는지 확인한다. */
    @Test
    void rejectsWeakNewPassword() {
        assertThatThrownBy(() -> passwordResetService.confirmReset(
                new PasswordResetConfirmRequest("raw-token", "onlyletters")))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.PASSWORD_POLICY_VIOLATION));
        verifyNoInteractions(tokenStore);
    }

    /**
     * 테스트에서 쓸 활성 사용자를 만든다.
     *
     * @param id 사용자 식별자
     * @param email 사용자 이메일
     * @return 식별자가 주입된 활성 사용자
     */
    private User activeUser(Long id, String email) {
        User user = User.createActive("fan-login", email, "encoded-old", "팬",
                UserRole.FAN, PreferredLanguage.KOREAN);
        ReflectionTestUtils.setField(user, "id", id);
        return user;
    }
}
