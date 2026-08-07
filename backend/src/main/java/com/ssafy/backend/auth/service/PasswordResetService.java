package com.ssafy.backend.auth.service;

import com.ssafy.backend.auth.dto.PasswordResetConfirmRequest;
import com.ssafy.backend.auth.dto.PasswordResetConfirmResponse;
import com.ssafy.backend.auth.dto.PasswordResetRequest;
import com.ssafy.backend.auth.dto.PasswordResetSendResponse;
import com.ssafy.backend.auth.jwt.TokenSessionStore;
import com.ssafy.backend.auth.support.PasswordPolicy;
import com.ssafy.backend.auth.support.PasswordResetTokenStore;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserStatus;
import com.ssafy.backend.user.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.Optional;

/**
 * 로그인하지 못하는 사용자가 메일 링크로 비밀번호를 다시 설정하도록 돕는다.
 *
 * <p>메일을 보낼 수 없는 요청(가입되지 않은 주소, 탈퇴 계정, 소셜 전용 계정)도 성공과 같은 응답을
 * 돌려준다. 응답이 달라지면 로그인 없이 "이 주소가 가입되어 있는지"를 확인할 수 있게 된다.
 */
@Service
public class PasswordResetService {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);

    private final UserRepository userRepository;
    private final PasswordResetTokenStore tokenStore;
    private final PasswordResetMailSender mailSender;
    private final PasswordResetRateLimiter rateLimiter;
    private final PasswordResetPolicy policy;
    private final PasswordEncoder passwordEncoder;
    private final TokenSessionStore tokenSessionStore;
    private final Clock clock;

    /**
     * 재설정 메일 발송과 토큰 검증에 필요한 협력 객체를 주입받는다.
     *
     * @param userRepository 사용자 저장소
     * @param tokenStore 재설정 토큰 보관소
     * @param mailSender 재설정 메일 발송 구현
     * @param rateLimiter 발송 빈도 제한
     * @param policy 유효 시간과 링크 구성 정책
     * @param passwordEncoder 새 비밀번호 암호화기
     * @param tokenSessionStore 재설정 후 기존 세션을 끊을 토큰 세션 저장소
     * @param clock 발송·만료 시각 계산용 시계
     */
    public PasswordResetService(UserRepository userRepository,
                                PasswordResetTokenStore tokenStore,
                                PasswordResetMailSender mailSender,
                                PasswordResetRateLimiter rateLimiter,
                                PasswordResetPolicy policy,
                                PasswordEncoder passwordEncoder,
                                TokenSessionStore tokenSessionStore,
                                Clock clock) {
        this.userRepository = userRepository;
        this.tokenStore = tokenStore;
        this.mailSender = mailSender;
        this.rateLimiter = rateLimiter;
        this.policy = policy;
        this.passwordEncoder = passwordEncoder;
        this.tokenSessionStore = tokenSessionStore;
        this.clock = clock;
    }

    /**
     * 전달된 이메일로 비밀번호 재설정 링크를 발송한다.
     *
     * @param request 재설정 메일을 받을 이메일
     * @return 링크 만료 시각과 다음 요청 가능 시각
     * @throws BusinessException 발송 빈도 제한에 걸렸거나 메일 발송에 실패한 경우
     */
    @Transactional(readOnly = true)
    public PasswordResetSendResponse requestReset(PasswordResetRequest request) {
        // 가입에서 소문자로 정규화해 저장하므로 조회도 같은 형태로 맞춘다.
        String email = request.email().trim().toLowerCase(Locale.ROOT);
        if (!rateLimiter.canSend(email)) {
            // 이메일 존재 여부와 무관하게 요청 횟수만으로 판단하므로 이 응답은 계정을 드러내지 않는다.
            throw new BusinessException(ErrorCode.TOO_MANY_REQUESTS);
        }

        LocalDateTime now = LocalDateTime.now(clock);
        LocalDateTime expiresAt = now.plus(policy.tokenTtl());
        // 없는 주소로 온 요청도 기록해, 대량 요청으로 가입 여부를 훑는 비용을 같게 만든다.
        rateLimiter.recordSend(email);

        String rawToken = findResettableUser(email)
                .map(user -> sendResetMail(user, expiresAt))
                .orElse(null);

        return PasswordResetSendResponse.of(
                email,
                expiresAt,
                now.plus(rateLimiter.resendCooldown()),
                // 운영에서는 절대 채우지 않으며 개발 프로파일에서만 수동 테스트용으로 노출한다.
                policy.exposeToken() ? rawToken : null
        );
    }

    /**
     * 메일로 받은 토큰을 검증하고 새 비밀번호를 저장한다.
     *
     * <p>재설정에 성공하면 남아 있던 로그인 세션을 모두 끊는다. 비밀번호를 도용당해 재설정한
     * 경우라면 침입자의 세션이 그대로 살아 있으면 안 되기 때문이다.
     *
     * @param request 토큰 원문과 새 비밀번호
     * @return 비밀번호를 바꾼 계정의 로그인 ID와 처리 시각
     * @throws BusinessException 토큰이 유효하지 않거나 새 비밀번호가 정책을 만족하지 않는 경우
     */
    @Transactional
    public PasswordResetConfirmResponse confirmReset(PasswordResetConfirmRequest request) {
        PasswordPolicy.validate(request.newPassword());

        String rawToken = request.token().trim();
        User user = tokenStore.findUserId(rawToken)
                .flatMap(userRepository::findById)
                .filter(found -> found.getStatus() == UserStatus.ACTIVE && !found.isSocialOnly())
                .orElseThrow(() -> new BusinessException(ErrorCode.PASSWORD_RESET_TOKEN_INVALID));

        user.changePassword(passwordEncoder.encode(request.newPassword()));
        // 같은 링크를 두 번 쓸 수 없도록 즉시 지운다.
        tokenStore.consume(rawToken);
        rateLimiter.clear(user.getEmail());
        // 단일 세션 구조라 세션 하나를 지우면 모든 기기의 Access·Refresh Token이 함께 무효가 된다.
        tokenSessionStore.delete(user.getId());

        return PasswordResetConfirmResponse.of(user.getLoginId(), LocalDateTime.now(clock));
    }

    /**
     * 재설정 메일을 보낼 수 있는 계정을 찾는다.
     *
     * @param email 정규화된 이메일
     * @return 활성 상태이며 비밀번호로 로그인하는 계정이면 해당 사용자, 아니면 비어 있는 결과
     */
    private Optional<User> findResettableUser(String email) {
        return userRepository.findByEmail(email)
                .filter(user -> {
                    if (user.getStatus() != UserStatus.ACTIVE) {
                        return false;
                    }
                    if (user.isSocialOnly()) {
                        // 비밀번호로 로그인하지 않는 계정이라 새 비밀번호를 만들어도 쓸 곳이 없다.
                        log.info("소셜 전용 계정의 비밀번호 재설정 요청을 무시했습니다. userId={}", user.getId());
                        return false;
                    }
                    return true;
                });
    }

    /**
     * 사용자에게 재설정 토큰을 발급하고 메일을 발송한다.
     *
     * @param user 메일을 받을 사용자
     * @param expiresAt 링크 만료 시각
     * @return 발급한 토큰 원문
     * @throws BusinessException 메일 발송에 실패한 경우
     */
    private String sendResetMail(User user, LocalDateTime expiresAt) {
        String rawToken = tokenStore.issue(user.getId(), policy.tokenTtl());
        try {
            mailSender.send(user, policy.resetLink(rawToken), expiresAt);
        } catch (BusinessException exception) {
            // 발송이 실패한 링크는 아무도 쓸 수 없으므로 남겨 두지 않는다.
            tokenStore.consume(rawToken);
            throw exception;
        }
        return rawToken;
    }
}
