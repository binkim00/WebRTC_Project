package com.ssafy.backend.auth.service;

import com.ssafy.backend.user.domain.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * SMTP 발송 인프라가 없는 환경에서 인증 링크를 로그로만 남기는 개발용 구현이다.
 *
 * <p>운영에서는 {@link EmailVerificationSender}의 SMTP 구현을 추가하고
 * {@code app.email-verification.delivery=smtp}로 바꿔야 한다. 이 구현이 그대로 운영에 올라가도
 * 링크가 새어 나가지 않도록, 링크 출력은 {@link EmailVerificationPolicy}가 개발 프로파일에서만
 * 허용한 경우에 한정한다.
 */
@Component
@ConditionalOnProperty(
        prefix = "app.email-verification", name = "delivery",
        havingValue = "log", matchIfMissing = true
)
public class LoggingEmailVerificationSender implements EmailVerificationSender {

    private static final Logger log = LoggerFactory.getLogger(LoggingEmailVerificationSender.class);

    private final EmailVerificationPolicy policy;

    /**
     * 토큰 노출 허용 여부를 판단할 인증 정책을 주입받는다.
     *
     * @param policy 이메일 인증 정책
     */
    public LoggingEmailVerificationSender(EmailVerificationPolicy policy) {
        this.policy = policy;
    }

    /**
     * 인증 링크를 발송하는 대신 로그로 남긴다.
     *
     * @param user 인증 메일을 받을 사용자
     * @param verificationLink 인증 완료 화면으로 이어지는 링크
     * @param expiresAt 링크 만료 시각
     */
    @Override
    public void send(User user, String verificationLink, LocalDateTime expiresAt) {
        if (policy.exposeToken()) {
            log.info("[개발용] 이메일 인증 링크 userId={} expiresAt={} link={}",
                    user.getId(), expiresAt, verificationLink);
            return;
        }
        // 링크와 이메일 주소를 남기지 않고 발송 시도 사실만 기록한다.
        log.warn("이메일 인증 메일을 발송할 SMTP 구현이 없습니다. userId={} expiresAt={}",
                user.getId(), expiresAt);
    }
}
