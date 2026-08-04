package com.ssafy.backend.auth.dto;

import com.ssafy.backend.user.domain.User;

import java.time.LocalDateTime;

/**
 * 이메일 인증 완료 결과를 전달한다.
 *
 * @param userId 인증을 마친 사용자 식별자
 * @param email 인증된 이메일 주소
 * @param emailVerifiedAt 인증이 완료된 시각
 */
public record EmailVerificationConfirmResponse(
        Long userId,
        String email,
        LocalDateTime emailVerifiedAt
) {

    /**
     * 인증을 마친 사용자 엔티티를 응답으로 변환한다.
     *
     * @param user 인증이 완료된 사용자
     * @return 이메일 인증 완료 응답
     */
    public static EmailVerificationConfirmResponse from(User user) {
        return new EmailVerificationConfirmResponse(
                user.getId(), user.getEmail(), user.getEmailVerifiedAt()
        );
    }
}
