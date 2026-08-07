package com.ssafy.backend.auth.service;

import com.ssafy.backend.auth.support.PasswordResetMailContent;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.notification.support.NotificationLanguage;
import com.ssafy.backend.user.domain.User;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;

/**
 * SMTP로 비밀번호 재설정 링크를 실제 발송하는 구현이다.
 *
 * <p>{@code app.email-verification.delivery=smtp}일 때만 등록되며 발신 주소도 이메일 인증과 같은
 * 설정을 쓴다. 발송 실패는 삼키지 않고 예외로 올려 호출자가 실패를 알 수 있게 한다. 메일이 나가지
 * 않았는데 성공으로 응답하면 사용자는 오지 않는 메일을 계속 기다리게 된다.
 */
@Component
@ConditionalOnProperty(
        prefix = "app.email-verification", name = "delivery", havingValue = "smtp"
)
public class SmtpPasswordResetMailSender implements PasswordResetMailSender {

    private static final Logger log = LoggerFactory.getLogger(SmtpPasswordResetMailSender.class);

    private final JavaMailSender mailSender;
    private final String from;

    /**
     * 메일 발송기와 발신 주소를 주입받는다.
     *
     * @param mailSender SMTP 발송기
     * @param from 발신 주소
     * @throws IllegalArgumentException 발신 주소가 비어 있는 경우
     */
    public SmtpPasswordResetMailSender(
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
     * 재설정 링크를 담은 안내 메일을 수신자의 선호 언어로 발송한다.
     *
     * @param user 재설정 메일을 받을 사용자
     * @param resetLink 새 비밀번호 입력 화면으로 이어지는 링크
     * @param expiresAt 링크 만료 시각
     * @throws BusinessException 메일을 조립하지 못했거나 SMTP 발송에 실패한 경우
     */
    @Override
    public void send(User user, String resetLink, LocalDateTime expiresAt) {
        PasswordResetMailContent content = PasswordResetMailContent.of(
                NotificationLanguage.from(user.getPreferredLanguage()),
                user.getNickname(),
                resetLink,
                expiresAt
        );

        try {
            MimeMessage message = mailSender.createMimeMessage();
            // multipart를 켜야 텍스트와 HTML을 한 통에 같이 담을 수 있다.
            MimeMessageHelper helper = new MimeMessageHelper(
                    message, true, StandardCharsets.UTF_8.name());
            helper.setFrom(from);
            helper.setTo(user.getEmail());
            helper.setSubject(content.subject());
            // 텍스트를 먼저 넘겨야 대체 본문으로, HTML이 기본 본문으로 들어간다.
            helper.setText(content.text(), content.html());
            mailSender.send(message);
        } catch (MessagingException | MailException exception) {
            // 링크에는 토큰 원문이 들어 있으므로 실패 로그에도 남기지 않는다.
            log.error("비밀번호 재설정 메일 발송에 실패했습니다. userId={}", user.getId(), exception);
            throw new BusinessException(ErrorCode.PASSWORD_RESET_SEND_FAILED);
        }
    }
}
