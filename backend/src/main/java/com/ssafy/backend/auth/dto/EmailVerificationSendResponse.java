package com.ssafy.backend.auth.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.LocalDateTime;

/**
 * 인증 메일 발송·재발송 결과를 전달한다.
 *
 * @param email 인증 메일을 보낸 주소
 * @param expiresAt 인증 링크 만료 시각
 * @param resendAvailableAt 다음 재발송이 가능해지는 시각
 * @param devToken 개발 환경에서만 채우는 인증 토큰 원문이며 운영에서는 항상 {@code null}
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record EmailVerificationSendResponse(
        String email,
        LocalDateTime expiresAt,
        LocalDateTime resendAvailableAt,
        String devToken
) {

    /**
     * 운영과 개발 모두에서 사용할 발송 응답을 생성한다.
     *
     * @param email 인증 메일을 보낸 주소
     * @param expiresAt 인증 링크 만료 시각
     * @param resendAvailableAt 다음 재발송이 가능해지는 시각
     * @param devToken 개발 환경에서만 노출할 토큰 원문이며 운영에서는 {@code null}
     * @return 인증 메일 발송 응답
     */
    public static EmailVerificationSendResponse of(
            String email, LocalDateTime expiresAt, LocalDateTime resendAvailableAt, String devToken
    ) {
        return new EmailVerificationSendResponse(email, expiresAt, resendAvailableAt, devToken);
    }
}
