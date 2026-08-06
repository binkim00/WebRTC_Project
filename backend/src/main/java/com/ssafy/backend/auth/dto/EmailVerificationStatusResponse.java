package com.ssafy.backend.auth.dto;

import com.ssafy.backend.user.domain.User;

import java.time.LocalDateTime;

/**
 * 현재 사용자의 이메일 인증 상태를 전달한다.
 *
 * @param email 인증 대상 이메일
 * @param emailVerified 인증 완료 여부
 * @param emailVerifiedAt 인증 완료 시각이며 미인증이면 {@code null}
 */
public record EmailVerificationStatusResponse(
        String email,
        boolean emailVerified,
        LocalDateTime emailVerifiedAt
) {

    /**
     * 사용자 엔티티를 인증 상태 응답으로 변환한다.
     *
     * @param user 변환할 사용자
     * @return 이메일 인증 상태 응답
     */
    public static EmailVerificationStatusResponse from(User user) {
        return new EmailVerificationStatusResponse(
                user.getEmail(), user.isEmailVerified(), user.getEmailVerifiedAt()
        );
    }
}
