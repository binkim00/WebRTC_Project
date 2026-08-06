package com.ssafy.backend.auth.service;

import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import jakarta.mail.Message;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SmtpEmailVerificationSenderTest {

    private static final String FROM = "no-reply@melly.example";
    private static final String LINK = "https://melly.example/email-verification?token=raw-token";
    private static final LocalDateTime EXPIRES_AT = LocalDateTime.of(2026, 8, 4, 12, 0);

    private JavaMailSender mailSender;
    private SmtpEmailVerificationSender sender;
    private User user;

    /**
     * 발송기 mock과 발신 주소를 갖춘 SMTP 발송 구현을 구성한다.
     *
     * <p>mock은 {@code createMimeMessage()}에서 null을 주므로, 실제 구현이 만드는 빈 메시지를
     * 돌려주도록 미리 지정한다.
     */
    @BeforeEach
    void setUp() {
        mailSender = mock(JavaMailSender.class);
        when(mailSender.createMimeMessage())
                .thenAnswer(invocation -> new JavaMailSenderImpl().createMimeMessage());
        sender = new SmtpEmailVerificationSender(mailSender, FROM);
        user = activeFan(1L, PreferredLanguage.KOREAN, "팬");
    }

    /** 발신·수신 주소와 제목을 담고 인증 링크가 본문에 들어가는지 검증한다. */
    @Test
    void sendsMailWithVerificationLink() throws Exception {
        sender.send(user, LINK, EXPIRES_AT);

        MimeMessage message = captureSentMessage();
        assertThat(message.getFrom()).hasSize(1);
        assertThat(message.getFrom()[0].toString()).isEqualTo(FROM);
        assertThat(message.getRecipients(Message.RecipientType.TO)).hasSize(1);
        assertThat(message.getRecipients(Message.RecipientType.TO)[0].toString())
                .isEqualTo("fan@example.com");
        assertThat(message.getSubject()).contains("이메일 인증");
        assertThat(bodyOf(message)).contains(LINK).contains("팬");
    }

    /** HTML과 순수 텍스트를 함께 담아 HTML을 못 읽는 클라이언트도 링크를 볼 수 있는지 검증한다. */
    @Test
    void sendsBothHtmlAndPlainTextBodies() throws Exception {
        sender.send(user, LINK, EXPIRES_AT);

        String body = bodyOf(captureSentMessage());
        // HTML 쪽에만 있는 조판과, 텍스트 쪽에만 있는 평문 안내가 모두 보여야 멀티파트가 맞다.
        assertThat(body).contains("<!DOCTYPE html>");
        assertThat(body).contains("이메일 인증하기");
        assertThat(body).contains("본인이 요청하지 않았다면");
    }

    /** 서비스 디자인의 브랜드 색과 만료 시각 표기가 본문에 들어가는지 검증한다. */
    @Test
    void appliesBrandColorAndReadableExpiry() throws Exception {
        sender.send(user, LINK, EXPIRES_AT);

        String body = bodyOf(captureSentMessage());
        assertThat(body).contains("#c93634");
        // LocalDateTime.toString()이 그대로 새어 나가면 안 된다.
        assertThat(body).doesNotContain("2026-08-04T12:00");
        assertThat(body).contains("2026년 8월 4일");
    }

    /** 한국어를 고르지 않은 회원에게는 영어 제목과 본문을 보내는지 검증한다. */
    @Test
    void sendsEnglishMailForNonKoreanMember() throws Exception {
        User englishFan = activeFan(2L, PreferredLanguage.ENGLISH, "Fan");

        sender.send(englishFan, LINK, EXPIRES_AT);

        MimeMessage message = captureSentMessage();
        assertThat(message.getSubject()).isEqualTo("[Melly] Please verify your email");
        assertThat(bodyOf(message)).contains("Verify my email").contains("Aug 4, 2026");
    }

    /** 선호 언어를 알 수 없는 회원에게는 서비스 기본 언어인 한국어로 보내는지 검증한다. */
    @Test
    void fallsBackToKoreanWhenPreferredLanguageMissing() throws Exception {
        User unknownFan = activeFan(3L, null, "팬");

        sender.send(unknownFan, LINK, EXPIRES_AT);

        assertThat(captureSentMessage().getSubject()).contains("이메일 인증");
    }

    /** SMTP 발송 실패를 공통 오류 코드로 변환해 트랜잭션이 되돌아가게 하는지 검증한다. */
    @Test
    void translatesMailFailureToBusinessException() {
        doThrow(new MailSendException("smtp down")).when(mailSender).send(any(MimeMessage.class));

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

    /**
     * 발송기에 넘겨진 메일 한 통을 꺼낸다.
     *
     * @return 발송 요청된 메일 메시지
     */
    private MimeMessage captureSentMessage() {
        ArgumentCaptor<MimeMessage> captor = ArgumentCaptor.forClass(MimeMessage.class);
        verify(mailSender).send(captor.capture());
        return captor.getValue();
    }

    /**
     * 멀티파트 메일의 모든 파트를 이어 붙여 본문 전체를 문자열로 만든다.
     *
     * <p>텍스트와 HTML이 각각 어느 파트에 들어갔는지까지 따지지 않고, 본문에 있어야 할 내용이
     * 빠지지 않았는지만 확인하기 위한 검증용 도우미다.
     *
     * @param message 발송 요청된 메일 메시지
     * @return 모든 파트의 내용을 이어 붙인 문자열
     * @throws Exception 메일 내용을 읽지 못한 경우
     */
    private String bodyOf(MimeMessage message) throws Exception {
        StringBuilder collected = new StringBuilder();
        appendParts(message.getContent(), collected);
        return collected.toString();
    }

    /**
     * 파트가 멀티파트면 하위 파트까지 따라 들어가며 내용을 모은다.
     *
     * @param content 메일 파트의 내용
     * @param collected 내용을 모을 버퍼
     * @throws Exception 메일 내용을 읽지 못한 경우
     */
    private void appendParts(Object content, StringBuilder collected) throws Exception {
        if (content instanceof MimeMultipart multipart) {
            for (int index = 0; index < multipart.getCount(); index++) {
                appendParts(multipart.getBodyPart(index).getContent(), collected);
            }
            return;
        }
        collected.append(content);
    }

    /**
     * 테스트에 사용할 활성 팬 사용자를 만든다.
     *
     * @param id 사용자 식별자
     * @param preferredLanguage 선호 언어이며 알 수 없는 경우를 재현하려면 null
     * @param nickname 닉네임
     * @return 활성 팬 사용자
     */
    private User activeFan(Long id, PreferredLanguage preferredLanguage, String nickname) {
        User fan = User.createActive(
                "fan01", "fan@example.com", "encoded", nickname,
                UserRole.FAN, preferredLanguage
        );
        ReflectionTestUtils.setField(fan, "id", id);
        return fan;
    }
}
