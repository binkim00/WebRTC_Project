package com.ssafy.backend.auth.service;

import com.ssafy.backend.auth.domain.EmailVerificationToken;
import com.ssafy.backend.auth.dto.EmailVerificationConfirmResponse;
import com.ssafy.backend.auth.dto.EmailVerificationSendResponse;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.auth.repository.EmailVerificationTokenRepository;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.common.support.RequestRateLimiter;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HexFormat;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class EmailVerificationServiceTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Instant NOW = Instant.parse("2026-08-04T03:00:00Z");
    private static final String CLIENT_IP = "203.0.113.10";
    private static final long TTL_SECONDS = 1800L;
    private static final long COOLDOWN_SECONDS = 60L;

    private CurrentUserService currentUserService;
    private EmailVerificationTokenRepository tokenRepository;
    private EmailVerificationMailSender mailSender;
    private RequestRateLimiter rateLimiter;
    private EmailVerificationService emailVerificationService;
    private AuthenticatedUser principal;
    private User user;

    /** 고정 시각과 통과 상태의 요청 제한기를 기본값으로 두고 서비스를 구성한다. */
    @BeforeEach
    void setUp() {
        currentUserService = mock(CurrentUserService.class);
        tokenRepository = mock(EmailVerificationTokenRepository.class);
        mailSender = mock(EmailVerificationMailSender.class);
        rateLimiter = mock(RequestRateLimiter.class);
        emailVerificationService = new EmailVerificationService(
                currentUserService,
                tokenRepository,
                mailSender,
                rateLimiter,
                Clock.fixed(NOW, SEOUL),
                TTL_SECONDS,
                COOLDOWN_SECONDS,
                5,
                3600L,
                10,
                600L
        );
        principal = new AuthenticatedUser(1L, UserRole.FAN);
        user = activeFan(1L);
        when(currentUserService.requireActiveUser(principal)).thenReturn(user);
        // boolean mock 기본값은 false 라 스텁하지 않으면 모든 요청이 제한에 걸린다.
        when(rateLimiter.tryConsume(anyString(), anyString(), anyInt(), any(Duration.class)))
                .thenReturn(true);
        when(rateLimiter.tryStartCooldown(anyString(), anyString(), any(Duration.class)))
                .thenReturn(true);
    }

    /** 인증 메일을 보내면 이전 링크를 무효화하고 만료·재발송 시각을 함께 응답하는지 검증한다. */
    @Test
    void sendsVerificationMailAndInvalidatesPreviousTokens() {
        EmailVerificationSendResponse response = emailVerificationService.send(principal);

        assertThat(response.email()).isEqualTo("fan@example.com");
        assertThat(response.expiresAt()).isEqualTo(now().plusSeconds(TTL_SECONDS));
        assertThat(response.resendAvailableAt()).isEqualTo(now().plusSeconds(COOLDOWN_SECONDS));
        verify(tokenRepository).consumeAllByUserId(1L, now());
        verify(mailSender).send(eq("fan@example.com"), eq("팬"), anyString(), eq(30L));
    }

    /** 원문 토큰은 저장하지 않고 해시만 남기는지 검증한다. */
    @Test
    void storesOnlyHashedToken() {
        emailVerificationService.send(principal);

        ArgumentCaptor<String> tokenCaptor = ArgumentCaptor.forClass(String.class);
        verify(mailSender).send(anyString(), anyString(), tokenCaptor.capture(), anyLong());
        ArgumentCaptor<EmailVerificationToken> savedCaptor =
                ArgumentCaptor.forClass(EmailVerificationToken.class);
        verify(tokenRepository).save(savedCaptor.capture());

        String rawToken = tokenCaptor.getValue();
        String storedHash = savedCaptor.getValue().getTokenHash();
        assertThat(storedHash).isNotEqualTo(rawToken).isEqualTo(sha256Hex(rawToken));
    }

    /** 이미 인증을 마친 계정의 발송 요청을 충돌로 거부하는지 검증한다. */
    @Test
    void rejectsSendForAlreadyVerifiedUser() {
        user.verifyEmail(now().minusDays(1));

        assertThatThrownBy(() -> emailVerificationService.send(principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.EMAIL_ALREADY_VERIFIED));

        verifyNoInteractions(mailSender);
        verify(tokenRepository, never()).save(any());
    }

    /** 재발송 간격을 지키지 않은 요청을 재시도 시간과 함께 429로 거부하는지 검증한다. */
    @Test
    void rejectsResendDuringCooldown() {
        when(rateLimiter.tryStartCooldown(anyString(), anyString(), any(Duration.class)))
                .thenReturn(false);
        when(rateLimiter.retryAfterSeconds(anyString(), anyString())).thenReturn(42L);

        assertThatThrownBy(() -> emailVerificationService.send(principal))
                .isInstanceOfSatisfying(BusinessException.class, exception -> {
                    assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.TOO_MANY_REQUESTS);
                    assertThat(exception.getRetryAfterSeconds()).isEqualTo(42L);
                });

        verifyNoInteractions(mailSender);
    }

    /** 발송 상한을 넘긴 요청을 쿨다운 검사 전에 429로 거부하는지 검증한다. */
    @Test
    void rejectsSendOverLimit() {
        when(rateLimiter.tryConsume(anyString(), anyString(), anyInt(), any(Duration.class)))
                .thenReturn(false);

        assertThatThrownBy(() -> emailVerificationService.send(principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.TOO_MANY_REQUESTS));

        verifyNoInteractions(mailSender);
    }

    /** 유효한 토큰으로 확인하면 인증 시각을 기록하고 토큰을 사용 완료로 바꾸는지 검증한다. */
    @Test
    void confirmsValidToken() {
        EmailVerificationToken token = issuedToken(now().plusMinutes(10));
        when(tokenRepository.findByTokenHash(sha256Hex("raw-token")))
                .thenReturn(Optional.of(token));

        EmailVerificationConfirmResponse response =
                emailVerificationService.confirm("raw-token", CLIENT_IP);

        assertThat(response.userId()).isEqualTo(1L);
        assertThat(response.emailVerifiedAt()).isEqualTo(now());
        assertThat(user.isEmailVerified()).isTrue();
        assertThat(token.getConsumedAt()).isEqualTo(now());
    }

    /** 존재하지 않는 토큰을 잘못된 링크로 거부하는지 검증한다. */
    @Test
    void rejectsUnknownToken() {
        when(tokenRepository.findByTokenHash(anyString())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> emailVerificationService.confirm("raw-token", CLIENT_IP))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.EMAIL_VERIFICATION_TOKEN_INVALID));
    }

    /** 만료된 토큰으로는 인증되지 않는지 검증한다. */
    @Test
    void rejectsExpiredToken() {
        when(tokenRepository.findByTokenHash(anyString()))
                .thenReturn(Optional.of(issuedToken(now().minusSeconds(1))));

        assertThatThrownBy(() -> emailVerificationService.confirm("raw-token", CLIENT_IP))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.EMAIL_VERIFICATION_TOKEN_INVALID));

        assertThat(user.isEmailVerified()).isFalse();
    }

    /** 이미 사용한 토큰을 재사용할 수 없는지 검증한다. */
    @Test
    void rejectsAlreadyConsumedToken() {
        EmailVerificationToken token = issuedToken(now().plusMinutes(10));
        token.consume(now().minusMinutes(1));
        when(tokenRepository.findByTokenHash(anyString())).thenReturn(Optional.of(token));

        assertThatThrownBy(() -> emailVerificationService.confirm("raw-token", CLIENT_IP))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.EMAIL_VERIFICATION_TOKEN_INVALID));

        assertThat(user.isEmailVerified()).isFalse();
    }

    /** 확인 시도 제한을 넘긴 요청을 토큰 조회 전에 429로 거부하는지 검증한다. */
    @Test
    void rejectsConfirmOverLimit() {
        when(rateLimiter.tryConsume(anyString(), anyString(), anyInt(), any(Duration.class)))
                .thenReturn(false);

        assertThatThrownBy(() -> emailVerificationService.confirm("raw-token", CLIENT_IP))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.TOO_MANY_REQUESTS));

        verifyNoInteractions(tokenRepository);
    }

    /** 테스트에서 사용할 발급 상태의 인증 토큰을 만든다. */
    private EmailVerificationToken issuedToken(LocalDateTime expiresAt) {
        return EmailVerificationToken.issue(user, sha256Hex("raw-token"), expiresAt);
    }

    /** 테스트에서 사용할 활성 팬 사용자를 만든다. */
    private User activeFan(Long id) {
        User fan = User.createActive(
                "fan01", "fan@example.com", "encoded", "팬",
                UserRole.FAN, PreferredLanguage.KOREAN
        );
        ReflectionTestUtils.setField(fan, "id", id);
        return fan;
    }

    /** 서비스와 같은 방식으로 토큰 해시를 계산한다. */
    private String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    /** 고정 시계가 가리키는 현재 시각을 반환한다. */
    private LocalDateTime now() {
        return LocalDateTime.ofInstant(NOW, SEOUL);
    }
}
