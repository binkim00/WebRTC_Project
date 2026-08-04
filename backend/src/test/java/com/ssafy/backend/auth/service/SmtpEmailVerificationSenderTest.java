package com.ssafy.backend.auth.service;

import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class SmtpEmailVerificationSenderTest {

    private static final String FROM = "no-reply@melly.example";
    private static final String LINK = "https://melly.example/email-verification?token=raw-token";
    private static final LocalDateTime EXPIRES_AT = LocalDateTime.of(2026, 8, 4, 12, 0);

    private JavaMailSender mailSender;
    private SmtpEmailVerificationSender sender;
    private User user;

    /** 발송기 mock과 발신 주소를 갖춘 SMTP 발송 구현을 구성한다. */
    @BeforeEach
    void setUp() {
        mailSender = mock(JavaMailSender.class);
        sender = new SmtpEmailVerificationSender(mailSender, FROM);
        user = activeFan(1L);
    }

    /** 발신·수신 주소와 인증 링크를 담아 메일을 발송하는지 검증한다. */
    @Test
    void sendsMailWithVerificationLink() {
        sender.send(user, LINK, EXPIRES_AT);

        ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(captor.capture());
        SimpleMailMessage message = captor.getValue();
        assertThat(message.getFrom()).isEqualTo(FROM);
        assertThat(message.getTo()).containsExactly("fan@example.com");
        assertThat(message.getSubject()).contains("이메일 인증");
        assertThat(message.getText()).contains(LINK).contains("팬");
    }

    /** SMTP 발송 실패를 공통 오류 코드로 변환해 트랜잭션이 되돌아가게 하는지 검증한다. */
    @Test
    void translatesMailFailureToBusinessException() {
        doThrow(new MailSendException("smtp down")).when(mailSender).send(any(SimpleMailMessage.class));

        assertThatThrownBy(() -> sender.send(user, LINK, EXPIRES_AT))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.EMAIL_VERIFICATION_SEND_FAILED));
    }

    /** 발신 주소를 설정하지 않으면 기동 단계에서 막는지 검증한다. */
    @Test
    void rejectsMissingFromAddress() {
        assertThatThrownBy(() -> new SmtpEmailVerificationSender(mailSender, "  "))
                .isInstanceOf(IllegalArgumentException.class);
    }

    /** 테스트에 사용할 활성 팬 사용자를 만든다. */
    private User activeFan(Long id) {
        User fan = User.createActive(
                "fan01", "fan@example.com", "encoded", "팬",
                UserRole.FAN, PreferredLanguage.KOREAN
        );
        ReflectionTestUtils.setField(fan, "id", id);
        return fan;
    }
}
