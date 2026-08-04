package com.ssafy.backend.auth.service;

import com.ssafy.backend.user.domain.User;

import java.time.LocalDateTime;

/**
 * 이메일 인증 링크 발송 방식을 추상화한다.
 *
 * <p>운영 SMTP 계정이 준비되기 전에도 인증 흐름 전체를 개발·검증할 수 있도록
 * 실제 발송 수단을 구현체로 분리한다. 구현체는 토큰 원문을 메일 본문 밖으로
 * 흘리지 않아야 하며, 특히 운영 환경에서는 로그나 API 응답에 남기지 않는다.
 */
public interface EmailVerificationSender {

    /**
     * 사용자의 이메일 주소로 인증 링크를 발송한다.
     *
     * @param user 인증 메일을 받을 사용자
     * @param verificationLink 인증 완료 화면으로 이어지는 링크
     * @param expiresAt 링크 만료 시각
     */
    void send(User user, String verificationLink, LocalDateTime expiresAt);
}
