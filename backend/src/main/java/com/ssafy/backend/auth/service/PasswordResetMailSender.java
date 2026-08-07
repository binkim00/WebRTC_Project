package com.ssafy.backend.auth.service;

import com.ssafy.backend.user.domain.User;

import java.time.LocalDateTime;

/**
 * 비밀번호 재설정 링크 발송 방식을 추상화한다.
 *
 * <p>이메일 인증과 같은 이유로 실제 발송 수단을 구현체로 분리한다. 발송 수단은
 * {@code app.email-verification.delivery} 값을 함께 따른다. 같은 SMTP 계정으로 나가는 메일이라
 * 설정을 두 벌 두면 한쪽만 켜진 채 배포되어 재설정 메일만 나가지 않는 사고가 생긴다.
 */
public interface PasswordResetMailSender {

    /**
     * 사용자의 이메일 주소로 비밀번호 재설정 링크를 발송한다.
     *
     * @param user 재설정 메일을 받을 사용자
     * @param resetLink 새 비밀번호 입력 화면으로 이어지는 링크
     * @param expiresAt 링크 만료 시각
     */
    void send(User user, String resetLink, LocalDateTime expiresAt);
}
