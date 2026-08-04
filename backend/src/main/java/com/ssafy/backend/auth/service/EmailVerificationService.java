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
import com.ssafy.backend.user.domain.User;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;

/**
 * 이메일 소유 확인용 인증 메일 발송과 링크 검증을 처리한다.
 *
 * <p>원문 토큰은 메일로만 전달하고 저장은 해시로만 한다. 토큰이 256비트 난수라 사전 대입이
 * 불가능하므로 별도 비밀값 없이 SHA-256으로 충분하다. 추측 가능한 짧은 코드를 쓰지 않는 이유도 같다.
 */
@Service
public class EmailVerificationService {

    /** 재발송 최소 간격을 관리하는 제한 이름이다. */
    private static final String COOLDOWN_SCOPE = "email-verify:cooldown";
    /** 사용자별 발송 횟수 상한을 관리하는 제한 이름이다. */
    private static final String SEND_SCOPE = "email-verify:send";
    /** 토큰 확인 시도 횟수 상한을 관리하는 제한 이름이다. */
    private static final String CONFIRM_SCOPE = "email-verify:confirm";
    /** 인증 토큰 엔트로피이며 256비트를 사용한다. */
    private static final int TOKEN_BYTE_LENGTH = 32;

    private final CurrentUserService currentUserService;
    private final EmailVerificationTokenRepository tokenRepository;
    private final EmailVerificationMailSender mailSender;
    private final RequestRateLimiter rateLimiter;
    private final SecureRandom secureRandom = new SecureRandom();
    private final Clock clock;
    private final Duration ttl;
    private final Duration resendCooldown;
    private final int sendLimitCount;
    private final Duration sendLimitWindow;
    private final int confirmLimitCount;
    private final Duration confirmLimitWindow;

    /**
     * 인증 메일 발송과 검증에 필요한 저장소, 발송기, 요청 제한기와 정책 값을 주입받는다.
     *
     * @param currentUserService 인증 사용자를 활성 사용자로 조회하는 서비스
     * @param tokenRepository 인증 토큰 저장소
     * @param mailSender 인증 메일 발송기
     * @param rateLimiter 요청 제한기
     * @param clock 현재 시각 공급자
     * @param ttlSeconds 인증 링크 유효 시간(초)
     * @param resendCooldownSeconds 재발송 최소 간격(초)
     * @param sendLimitCount 구간당 발송 허용 횟수
     * @param sendLimitWindowSeconds 발송 횟수를 집계할 구간(초)
     * @param confirmLimitCount 구간당 확인 허용 횟수
     * @param confirmLimitWindowSeconds 확인 횟수를 집계할 구간(초)
     */
    public EmailVerificationService(
            CurrentUserService currentUserService,
            EmailVerificationTokenRepository tokenRepository,
            EmailVerificationMailSender mailSender,
            RequestRateLimiter rateLimiter,
            Clock clock,
            @Value("${app.email-verification.ttl-seconds}") long ttlSeconds,
            @Value("${app.email-verification.resend-cooldown-seconds}") long resendCooldownSeconds,
            @Value("${app.email-verification.send-limit-count}") int sendLimitCount,
            @Value("${app.email-verification.send-limit-window-seconds}") long sendLimitWindowSeconds,
            @Value("${app.email-verification.confirm-limit-count}") int confirmLimitCount,
            @Value("${app.email-verification.confirm-limit-window-seconds}") long confirmLimitWindowSeconds
    ) {
        this.currentUserService = currentUserService;
        this.tokenRepository = tokenRepository;
        this.mailSender = mailSender;
        this.rateLimiter = rateLimiter;
        this.clock = clock;
        this.ttl = Duration.ofSeconds(ttlSeconds);
        this.resendCooldown = Duration.ofSeconds(resendCooldownSeconds);
        this.sendLimitCount = sendLimitCount;
        this.sendLimitWindow = Duration.ofSeconds(sendLimitWindowSeconds);
        this.confirmLimitCount = confirmLimitCount;
        this.confirmLimitWindow = Duration.ofSeconds(confirmLimitWindowSeconds);
    }

    /**
     * 현재 로그인 사용자의 이메일로 인증 메일을 발송한다.
     *
     * <p>이전에 보낸 링크는 무효화해 항상 마지막 메일 하나만 유효하게 둔다.
     * 발송이 실패하면 트랜잭션이 되돌아가 토큰도 남지 않는다.
     *
     * @param principal JWT 인증 사용자 정보
     * @return 발송 주소와 만료·재발송 가능 시각
     * @throws BusinessException 이미 인증된 계정이거나 발송 제한에 걸린 경우
     */
    @Transactional
    public EmailVerificationSendResponse send(AuthenticatedUser principal) {
        User user = currentUserService.requireActiveUser(principal);
        if (user.isEmailVerified()) {
            throw new BusinessException(ErrorCode.EMAIL_ALREADY_VERIFIED);
        }

        String userKey = String.valueOf(user.getId());
        if (!rateLimiter.tryConsume(SEND_SCOPE, userKey, sendLimitCount, sendLimitWindow)) {
            throw new BusinessException(
                    ErrorCode.TOO_MANY_REQUESTS, rateLimiter.retryAfterSeconds(SEND_SCOPE, userKey));
        }
        if (!rateLimiter.tryStartCooldown(COOLDOWN_SCOPE, userKey, resendCooldown)) {
            throw new BusinessException(
                    ErrorCode.TOO_MANY_REQUESTS, rateLimiter.retryAfterSeconds(COOLDOWN_SCOPE, userKey));
        }

        LocalDateTime now = LocalDateTime.now(clock);
        tokenRepository.consumeAllByUserId(user.getId(), now);

        String rawToken = generateToken();
        LocalDateTime expiresAt = now.plus(ttl);
        tokenRepository.save(EmailVerificationToken.issue(user, hash(rawToken), expiresAt));
        mailSender.send(user.getEmail(), user.getNickname(), rawToken, ttl.toMinutes());

        return new EmailVerificationSendResponse(
                user.getEmail(), expiresAt, now.plus(resendCooldown));
    }

    /**
     * 메일 링크의 토큰을 검증하고 이메일 인증을 완료한다.
     *
     * <p>메일을 다른 브라우저나 기기에서 열 수 있어 로그인 상태를 요구하지 않는다.
     * 대신 토큰 자체가 소유 증명이므로 만료와 재사용을 엄격히 막는다.
     *
     * @param rawToken 메일 링크에 담긴 원문 토큰
     * @param clientIp 확인 시도 횟수를 제한할 요청자 IP
     * @return 인증을 마친 사용자 정보
     * @throws BusinessException 토큰이 없거나 만료·사용 완료 상태이거나 시도 제한에 걸린 경우
     */
    @Transactional
    public EmailVerificationConfirmResponse confirm(String rawToken, String clientIp) {
        if (!rateLimiter.tryConsume(CONFIRM_SCOPE, clientIp, confirmLimitCount, confirmLimitWindow)) {
            throw new BusinessException(
                    ErrorCode.TOO_MANY_REQUESTS, rateLimiter.retryAfterSeconds(CONFIRM_SCOPE, clientIp));
        }

        EmailVerificationToken token = tokenRepository.findByTokenHash(hash(rawToken))
                .orElseThrow(() -> new BusinessException(ErrorCode.EMAIL_VERIFICATION_TOKEN_INVALID));
        LocalDateTime now = LocalDateTime.now(clock);
        User user = token.getUser();

        try {
            token.consume(now);
            user.verifyEmail(now);
        } catch (IllegalStateException exception) {
            // 이미 인증을 마친 사용자가 같은 링크를 다시 열었을 때와 만료·재사용을 함께 처리한다.
            if (user.isEmailVerified() && token.getConsumedAt() != null) {
                throw new BusinessException(ErrorCode.EMAIL_ALREADY_VERIFIED);
            }
            throw new BusinessException(ErrorCode.EMAIL_VERIFICATION_TOKEN_INVALID);
        }

        // 인증을 마치면 남은 링크도 쓸 수 없도록 정리하고 재발송 쿨다운을 풀어 준다.
        rateLimiter.clear(COOLDOWN_SCOPE, String.valueOf(user.getId()));
        return EmailVerificationConfirmResponse.from(user);
    }

    /**
     * 추측할 수 없는 URL 안전 인증 토큰을 생성한다.
     *
     * @return 패딩 없는 Base64 URL 인코딩 토큰
     */
    private String generateToken() {
        byte[] bytes = new byte[TOKEN_BYTE_LENGTH];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /**
     * 저장과 비교에 사용할 토큰 해시를 만든다.
     *
     * @param rawToken 원문 토큰
     * @return 16진수로 표현한 SHA-256 해시
     */
    private String hash(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(rawToken.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 algorithm is not available.", exception);
        }
    }
}
