package com.ssafy.backend.auth.service;

import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

/** 이메일 인증 링크를 담은 안내 메일을 발송한다. */
@Component
public class EmailVerificationMailSender {

    private static final Logger log = LoggerFactory.getLogger(EmailVerificationMailSender.class);
    private static final String SUBJECT = "[Melly] 이메일 인증을 완료해 주세요";

    private final JavaMailSender mailSender;
    private final String from;
    private final String baseUrl;

    /**
     * 메일 발송기와 발신 주소, 인증 링크 기준 주소를 주입받는다.
     *
     * @param mailSender SMTP 발송기
     * @param from 발신 주소
     * @param baseUrl 인증 링크가 향할 프론트 화면 주소
     */
    public EmailVerificationMailSender(
            JavaMailSender mailSender,
            @Value("${app.email-verification.from}") String from,
            @Value("${app.email-verification.base-url}") String baseUrl
    ) {
        this.mailSender = mailSender;
        this.from = from;
        this.baseUrl = baseUrl;
    }

    /**
     * 인증 링크를 만들어 대상 주소로 발송한다.
     *
     * @param email 받는 사람 주소
     * @param nickname 안내문에 표시할 닉네임
     * @param rawToken 메일로만 전달하는 원문 인증 토큰
     * @param ttlMinutes 인증 링크 유효 시간(분)
     * @throws BusinessException SMTP 발송에 실패한 경우
     */
    public void send(String email, String nickname, String rawToken, long ttlMinutes) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(email);
        message.setSubject(SUBJECT);
        message.setText(body(nickname, rawToken, ttlMinutes));
        try {
            mailSender.send(message);
        } catch (MailException exception) {
            // 원문 토큰이 로그로 새지 않도록 주소와 실패 사실만 남긴다.
            log.error("이메일 인증 메일 발송에 실패했습니다. email={}", email, exception);
            throw new BusinessException(ErrorCode.EMAIL_VERIFICATION_SEND_FAILED);
        }
    }

    /**
     * 인증 링크가 포함된 본문을 작성한다.
     *
     * @param nickname 안내문에 표시할 닉네임
     * @param rawToken 원문 인증 토큰
     * @param ttlMinutes 인증 링크 유효 시간(분)
     * @return 메일 본문
     */
    private String body(String nickname, String rawToken, long ttlMinutes) {
        // 기준 주소에 이미 쿼리가 있어도 올바른 구분자가 붙도록 빌더로 조립한다.
        String link = UriComponentsBuilder.fromUriString(baseUrl)
                .queryParam("token", rawToken)
                .build()
                .toUriString();
        return """
                %s님, 안녕하세요.

                아래 링크를 열면 이메일 인증이 완료되고 팬미팅 응모를 진행할 수 있습니다.

                %s

                이 링크는 %d분 동안만 사용할 수 있습니다.
                본인이 요청하지 않았다면 이 메일을 무시해 주세요.
                """.formatted(nickname, link, ttlMinutes);
    }
}
