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
import com.ssafy.backend.user.domain.User;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Optional;

/**
 * 이메일 소유 확인을 위한 인증 메일 발송과 토큰 검증을 처리한다.
 *
 * <p>토큰 원문은 메일로만 전달하고 DB에는 HMAC-SHA-256 해시만 남긴다.
 * 하나의 토큰은 한 번만 사용할 수 있고, 새 메일을 보내면 이전 링크는 즉시 무효가 된다.
 */
@Service
public class EmailVerificationService {

    /** 인증 토큰 난수 길이이며 문서 기준인 256비트를 사용한다. */
    private static final int TOKEN_BYTES = 32;

    private final CurrentUserService currentUserService;
    private final EmailVerificationTokenRepository tokenRepository;
    private final EmailVerificationSender sender;
    private final EmailVerificationRateLimiter rateLimiter;
    private final EmailVerificationPolicy policy;
    private final HmacTokenHasher tokenHasher;
    private final SecureRandom secureRandom = new SecureRandom();
    private final Clock clock;

    /**
     * 인증 메일 발송과 토큰 검증에 필요한 협력 객체와 해시 비밀값을 주입받는다.
     *
     * @param currentUserService 현재 사용자 조회 서비스
     * @param tokenRepository 이메일 인증 토큰 저장소
     * @param sender 인증 메일 발송 구현
     * @param rateLimiter 발송·확인 빈도 제한
     * @param policy 유효 시간과 링크 구성 정책
     * @param hmacSecret 토큰 해시에 사용할 비밀값이며 미설정 시 JWT 비밀값을 사용한다
     * @param clock 발송·만료 시각 계산용 시계
     */
    public EmailVerificationService(
            CurrentUserService currentUserService,
            EmailVerificationTokenRepository tokenRepository,
            EmailVerificationSender sender,
            EmailVerificationRateLimiter rateLimiter,
            EmailVerificationPolicy policy,
            @Value("${app.email-verification.token-secret:${jwt.secret}}") String hmacSecret,
            Clock clock
    ) {
        this.currentUserService = currentUserService;
        this.tokenRepository = tokenRepository;
        this.sender = sender;
        this.rateLimiter = rateLimiter;
        this.policy = policy;
        this.tokenHasher = new HmacTokenHasher(hmacSecret);
        this.clock = clock;
    }

    /**
     * 현재 로그인한 사용자의 이메일로 인증 링크를 발송한다.
     *
     * <p>재발송 요청도 같은 흐름을 사용하며, 발송할 때마다 이전 링크를 무효화한다.
     *
     * @param principal JWT 인증 사용자 정보
     * @return 만료 시각과 다음 재발송 가능 시각
     * @throws BusinessException 이미 인증했거나 발송 빈도 제한에 걸린 경우
     */
    @Transactional
    public EmailVerificationSendResponse send(AuthenticatedUser principal) {
        User user = currentUserService.requireActiveUser(principal);
        if (user.isEmailVerified()) {
            throw new BusinessException(ErrorCode.EMAIL_ALREADY_VERIFIED);
        }
        if (!rateLimiter.canSend(user.getId())) {
            throw new BusinessException(ErrorCode.TOO_MANY_REQUESTS);
        }

        LocalDateTime now = LocalDateTime.now(clock);
        // 동시에 살아 있는 링크가 하나만 되도록 이전 발급분을 먼저 사용 완료로 만든다.
        tokenRepository.consumeAllByUserId(user.getId(), now);

        String rawToken = generateToken();
        LocalDateTime expiresAt = now.plus(policy.tokenTtl());
        tokenRepository.save(EmailVerificationToken.issue(user, tokenHasher.hash(rawToken), expiresAt));

        sender.send(user, policy.verificationLink(rawToken), expiresAt);
        rateLimiter.recordSend(user.getId());

        return EmailVerificationSendResponse.of(
                user.getEmail(),
                expiresAt,
                now.plus(rateLimiter.resendCooldown()),
                // 운영에서는 절대 채우지 않으며 개발 프로파일에서만 수동 테스트용으로 노출한다.
                policy.exposeToken() ? rawToken : null
        );
    }

    /**
     * 메일로 받은 토큰을 검증하고 사용자의 이메일 인증을 완료한다.
     *
     * @param principal JWT 인증 사용자 정보
     * @param request 인증 토큰 원문
     * @return 인증 완료 후 상태
     * @throws BusinessException 토큰이 유효하지 않거나 확인 시도 제한에 걸린 경우
     */
    @Transactional
    public EmailVerificationStatusResponse confirm(
            AuthenticatedUser principal, EmailVerificationConfirmRequest request
    ) {
        User user = currentUserService.requireActiveUser(principal);
        if (user.isEmailVerified()) {
            throw new BusinessException(ErrorCode.EMAIL_ALREADY_VERIFIED);
        }
        if (!rateLimiter.canConfirm(user.getId())) {
            throw new BusinessException(ErrorCode.TOO_MANY_REQUESTS);
        }

        LocalDateTime now = LocalDateTime.now(clock);
        EmailVerificationToken token = findUsableToken(request.token().trim(), user, now);

        token.consume(now);
        user.verifyEmail(now);
        rateLimiter.clear(user.getId());
        return EmailVerificationStatusResponse.from(user);
    }

    /**
     * 현재 로그인한 사용자의 이메일 인증 상태를 조회한다.
     *
     * @param principal JWT 인증 사용자 정보
     * @return 이메일 인증 상태
     */
    @Transactional(readOnly = true)
    public EmailVerificationStatusResponse status(AuthenticatedUser principal) {
        return EmailVerificationStatusResponse.from(currentUserService.requireActiveUser(principal));
    }

    /**
     * 토큰 해시로 사용 가능한 인증 토큰을 찾고, 실패는 모두 같은 오류로 응답한다.
     *
     * <p>만료·사용 완료·소유자 불일치를 구분해 알려 주면 다른 계정의 토큰 상태를 탐색할 수 있어
     * 실패 사유를 하나로 합치고 실패 횟수만 누적한다.
     *
     * @param rawToken 검증할 토큰 원문
     * @param user 토큰을 사용하려는 사용자
     * @param now 검증 기준 시각
     * @return 사용 가능한 인증 토큰
     * @throws BusinessException 토큰이 없거나 사용할 수 없는 경우
     */
    private EmailVerificationToken findUsableToken(String rawToken, User user, LocalDateTime now) {
        Optional<EmailVerificationToken> found = tokenRepository.findByTokenHash(tokenHasher.hash(rawToken))
                .filter(token -> token.getUser().getId().equals(user.getId()))
                .filter(token -> token.isUsable(now));
        if (found.isEmpty()) {
            rateLimiter.recordConfirmFailure(user.getId());
            throw new BusinessException(ErrorCode.EMAIL_VERIFICATION_TOKEN_INVALID);
        }
        return found.get();
    }

    /** URL에 그대로 실을 수 있는 256비트 난수 토큰을 생성한다. */
    private String generateToken() {
        byte[] token = new byte[TOKEN_BYTES];
        secureRandom.nextBytes(token);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(token);
    }
}
