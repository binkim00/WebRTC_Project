package com.ssafy.backend.auth.service;

import com.ssafy.backend.auth.domain.EmailVerificationToken;
import com.ssafy.backend.auth.dto.EmailVerificationConfirmRequest;
import com.ssafy.backend.auth.dto.EmailVerificationSendResponse;
import com.ssafy.backend.auth.dto.EmailVerificationStatusResponse;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.auth.repository.EmailVerificationTokenRepository;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.common.security.HmacTokenHasher;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 이메일 인증 메일 발송과 토큰 검증 규칙을 검증한다. */
class EmailVerificationServiceTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Instant NOW = Instant.parse("2026-08-03T03:00:00Z");
    private static final String SECRET = "0123456789abcdef0123456789abcdef";

    private CurrentUserService currentUserService;
    private EmailVerificationTokenRepository tokenRepository;
    private EmailVerificationSender sender;
    private EmailVerificationRateLimiter rateLimiter;
    private EmailVerificationService emailVerificationService;
    private HmacTokenHasher tokenHasher;
    private AuthenticatedUser principal;
    private User user;

    /** 각 테스트에서 사용할 미인증 사용자와 고정 시각 기반 인증 서비스를 구성한다. */
    @BeforeEach
    void setUp() {
        currentUserService = mock(CurrentUserService.class);
        tokenRepository = mock(EmailVerificationTokenRepository.class);
        sender = mock(EmailVerificationSender.class);
        rateLimiter = mock(EmailVerificationRateLimiter.class);
        tokenHasher = new HmacTokenHasher(SECRET);
        EmailVerificationPolicy policy = new EmailVerificationPolicy(
                new MockEnvironment(), 1800,
                "https://melly.test/email-verification", false
        );
        emailVerificationService = new EmailVerificationService(
                currentUserService, tokenRepository, sender, rateLimiter, policy,
                SECRET, Clock.fixed(NOW, SEOUL)
        );
        principal = new AuthenticatedUser(1L, UserRole.FAN);
        user = activeUser();
        when(currentUserService.requireActiveUser(principal)).thenReturn(user);
        when(rateLimiter.canSend(1L)).thenReturn(true);
        when(rateLimiter.canConfirm(1L)).thenReturn(true);
        when(rateLimiter.resendCooldown()).thenReturn(Duration.ofSeconds(60));
    }

    /** 발송 시 이전 토큰을 무효화하고 해시만 저장한 뒤 만료·재발송 시각을 응답하는지 검증한다. */
    @Test
    void sendsVerificationMailAndStoresOnlyHash() {
        EmailVerificationSendResponse response = emailVerificationService.send(principal);

        verify(tokenRepository).consumeAllByUserId(1L, now());
        ArgumentCaptor<EmailVerificationToken> captor =
                ArgumentCaptor.forClass(EmailVerificationToken.class);
        verify(tokenRepository).save(captor.capture());
        EmailVerificationToken saved = captor.getValue();
        assertThat(saved.getTokenHash()).hasSize(64);
        assertThat(saved.getExpiresAt()).isEqualTo(now().plusMinutes(30));
        assertThat(saved.getConsumedAt()).isNull();

        assertThat(response.expiresAt()).isEqualTo(now().plusMinutes(30));
        assertThat(response.resendAvailableAt()).isEqualTo(now().plusSeconds(60));
        verify(rateLimiter).recordSend(1L);
    }

    /** 운영 설정에서는 응답에 토큰 원문을 담지 않는지 검증한다. */
    @Test
    void neverExposesRawTokenWhenExposureDisabled() {
        assertThat(emailVerificationService.send(principal).devToken()).isNull();
    }

    /** 재발송 간격이나 시간당 상한에 걸린 발송 요청을 429로 거부하는지 검증한다. */
    @Test
    void rejectsSendWhenRateLimited() {
        when(rateLimiter.canSend(1L)).thenReturn(false);

        assertThatThrownBy(() -> emailVerificationService.send(principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.TOO_MANY_REQUESTS));

        verify(tokenRepository, never()).save(any(EmailVerificationToken.class));
    }

    /** 이미 인증을 마친 계정의 발송 요청을 충돌로 거부하는지 검증한다. */
    @Test
    void rejectsSendForAlreadyVerifiedUser() {
        user.verifyEmail(now().minusDays(1));

        assertThatThrownBy(() -> emailVerificationService.send(principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.EMAIL_ALREADY_VERIFIED));
    }

    /** 유효한 토큰으로 인증하면 사용자에 인증 시각이 기록되고 토큰이 소모되는지 검증한다. */
    @Test
    void confirmsValidTokenAndMarksUserVerified() {
        String rawToken = "raw-token";
        EmailVerificationToken token = usableToken(rawToken);
        when(tokenRepository.findByTokenHash(tokenHasher.hash(rawToken)))
                .thenReturn(Optional.of(token));

        EmailVerificationStatusResponse response = emailVerificationService.confirm(
                new EmailVerificationConfirmRequest(rawToken));

        assertThat(response.emailVerified()).isTrue();
        assertThat(response.emailVerifiedAt()).isEqualTo(now());
        assertThat(token.getConsumedAt()).isEqualTo(now());
        verify(rateLimiter).clear(1L);
    }

    /** 만료된 토큰을 거부하고 실패 횟수를 누적하는지 검증한다. */
    @Test
    void rejectsExpiredToken() {
        String rawToken = "raw-token";
        EmailVerificationToken token = EmailVerificationToken.issue(
                user, tokenHasher.hash(rawToken), now().minusMinutes(1)
        );
        when(tokenRepository.findByTokenHash(tokenHasher.hash(rawToken)))
                .thenReturn(Optional.of(token));

        assertThatThrownBy(() -> emailVerificationService.confirm(
                new EmailVerificationConfirmRequest(rawToken)
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.EMAIL_VERIFICATION_TOKEN_INVALID));

        verify(rateLimiter).recordConfirmFailure(1L);
        assertThat(user.isEmailVerified()).isFalse();
    }

    /** 이미 사용한 토큰을 다시 쓸 수 없는지 검증한다. */
    @Test
    void rejectsAlreadyConsumedToken() {
        String rawToken = "raw-token";
        EmailVerificationToken token = usableToken(rawToken);
        token.consume(now().minusMinutes(5));
        when(tokenRepository.findByTokenHash(tokenHasher.hash(rawToken)))
                .thenReturn(Optional.of(token));

        assertThatThrownBy(() -> emailVerificationService.confirm(
                new EmailVerificationConfirmRequest(rawToken)
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.EMAIL_VERIFICATION_TOKEN_INVALID));
    }

    /** 다른 사용자에게 발급된 토큰을 거부하는지 검증한다. */
    @Test
    /** 로그인 principal과 관계없이 토큰 소유 사용자를 인증하는지 검증한다. */
    void confirmsTokenIssuedToAnotherUserWithoutPrincipal() {
        String rawToken = "raw-token";
        User other = activeUser();
        ReflectionTestUtils.setField(other, "id", 2L);
        EmailVerificationToken token = EmailVerificationToken.issue(
                other, tokenHasher.hash(rawToken), now().plusMinutes(10)
        );
        when(tokenRepository.findByTokenHash(tokenHasher.hash(rawToken)))
                .thenReturn(Optional.of(token));
        when(rateLimiter.canConfirm(2L)).thenReturn(true);

        EmailVerificationStatusResponse response = emailVerificationService.confirm(
                new EmailVerificationConfirmRequest(rawToken));

        assertThat(response.email()).isEqualTo(other.getEmail());
        assertThat(other.isEmailVerified()).isTrue();
        verify(rateLimiter).clear(2L);
    }

    /** 확인 시도 상한에 걸리면 토큰 조회 전에 429로 거부하는지 검증한다. */
    @Test
    void rejectsConfirmWhenRateLimited() {
        when(rateLimiter.canConfirm(1L)).thenReturn(false);

        when(tokenRepository.findByTokenHash(tokenHasher.hash("raw-token")))
                .thenReturn(Optional.of(usableToken("raw-token")));

        assertThatThrownBy(() -> emailVerificationService.confirm(
                new EmailVerificationConfirmRequest("raw-token")
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.TOO_MANY_REQUESTS));

        verify(rateLimiter, never()).recordConfirmFailure(anyLong());
    }

    /** 존재하지 않는 토큰은 무효 토큰 오류로 거부하는지 검증한다. */
    @Test
    void rejectsUnknownToken() {
        String rawToken = "unknown-token";
        when(tokenRepository.findByTokenHash(tokenHasher.hash(rawToken))).thenReturn(Optional.empty());

        assertThatThrownBy(() -> emailVerificationService.confirm(
                new EmailVerificationConfirmRequest(rawToken)
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.EMAIL_VERIFICATION_TOKEN_INVALID));

        verify(rateLimiter, never()).recordConfirmFailure(anyLong());
    }

    /** 아직 사용할 수 있는 테스트 토큰을 만든다. */
    private EmailVerificationToken usableToken(String rawToken) {
        return EmailVerificationToken.issue(user, tokenHasher.hash(rawToken), now().plusMinutes(10));
    }

    /** 식별자 1번을 가진 미인증 활성 사용자를 만든다. */
    private User activeUser() {
        User result = User.createActive(
                "fan01", "fan@example.com", "encoded", "팬",
                UserRole.FAN, PreferredLanguage.KOREAN
        );
        ReflectionTestUtils.setField(result, "id", 1L);
        return result;
    }

    /** 고정 Clock이 제공하는 서울 기준 현재 시각을 반환한다. */
    private LocalDateTime now() {
        return LocalDateTime.ofInstant(NOW, SEOUL);
    }
}
