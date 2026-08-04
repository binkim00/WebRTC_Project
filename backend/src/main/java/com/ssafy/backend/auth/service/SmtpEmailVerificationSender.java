package com.ssafy.backend.auth.service;

import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.user.domain.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;

/**
 * SMTP로 인증 링크를 실제 발송하는 구현이다.
 *
 * <p>{@code app.email-verification.delivery=smtp}일 때만 등록되며, 기본값인 {@code log}에서는
 * {@link LoggingEmailVerificationSender}가 대신 동작한다. 발송 실패는 삼키지 않고 예외로 올려
 * 호출 트랜잭션이 되돌아가게 한다. 토큰이 저장됐는데 메일이 나가지 않으면 사용자는 인증할
 * 방법이 없고, 이전 링크는 이미 무효화돼 있기 때문이다.
 */
@Component
@ConditionalOnProperty(
        prefix = "app.email-verification", name = "delivery", havingValue = "smtp"
)
public class SmtpEmailVerificationSender implements EmailVerificationSender {

    private static final Logger log = LoggerFactory.getLogger(SmtpEmailVerificationSender.class);
    private static final String SUBJECT = "[Melly] 이메일 인증을 완료해 주세요";

    private final JavaMailSender mailSender;
    private final String from;

    /**
     * 메일 발송기와 발신 주소를 주입받는다.
     *
     * @param mailSender SMTP 발송기
     * @param from 발신 주소
     * @throws IllegalArgumentException 발신 주소가 비어 있는 경우
     */
    public SmtpEmailVerificationSender(
            JavaMailSender mailSender,
            @Value("${app.email-verification.from:}") String from
    ) {
        if (!StringUtils.hasText(from)) {
            // 발신 주소가 없으면 발송이 런타임에야 실패하므로 기동 단계에서 막는다.
            throw new IllegalArgumentException(
                    "app.email-verification.from은 delivery=smtp일 때 필수입니다.");
        }
        this.mailSender = mailSender;
        this.from = from;
    }

    /**
     * 인증 링크를 담은 안내 메일을 발송한다.
     *
     * @param user 인증 메일을 받을 사용자
     * @param verificationLink 인증 완료 화면으로 이어지는 링크
     * @param expiresAt 링크 만료 시각
     * @throws BusinessException SMTP 발송에 실패한 경우
     */
    @Override
    public void send(User user, String verificationLink, LocalDateTime expiresAt) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(user.getEmail());
        message.setSubject(SUBJECT);
        message.setText(body(user.getNickname(), verificationLink, expiresAt));
        try {
            mailSender.send(message);
        } catch (MailException exception) {
            // 링크에는 토큰 원문이 들어 있으므로 실패 로그에도 남기지 않는다.
            log.error("이메일 인증 메일 발송에 실패했습니다. userId={}", user.getId(), exception);
            throw new BusinessException(ErrorCode.EMAIL_VERIFICATION_SEND_FAILED);
        }
    }

    /**
     * 인증 링크와 만료 시각을 담은 본문을 작성한다.
     *
     * @param nickname 안내문에 표시할 닉네임
     * @param verificationLink 인증 링크
     * @param expiresAt 링크 만료 시각
     * @return 메일 본문
     */
    private String body(String nickname, String verificationLink, LocalDateTime expiresAt) {
        return """
                %s님, 안녕하세요.

                아래 링크를 열면 이메일 인증이 완료되고 팬미팅 응모를 진행할 수 있습니다.

                %s

                이 링크는 %s까지만 사용할 수 있습니다.
                본인이 요청하지 않았다면 이 메일을 무시해 주세요.
                """.formatted(nickname, verificationLink, expiresAt);
    }
}
