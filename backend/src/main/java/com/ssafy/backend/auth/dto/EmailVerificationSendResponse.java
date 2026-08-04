package com.ssafy.backend.auth.dto;

import java.time.LocalDateTime;

/**
 * 인증 메일 발송 결과를 전달한다.
 *
 * @param email 인증 메일을 보낸 주소
 * @param expiresAt 인증 링크가 만료되는 시각
 * @param resendAvailableAt 재발송이 가능해지는 시각
 */
public record EmailVerificationSendResponse(
        String email,
        LocalDateTime expiresAt,
        LocalDateTime resendAvailableAt
) {
}
