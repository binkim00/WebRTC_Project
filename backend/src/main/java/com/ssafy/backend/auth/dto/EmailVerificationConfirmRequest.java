package com.ssafy.backend.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 메일로 받은 인증 토큰 확인 요청이다.
 *
 * @param token 인증 링크에 포함된 토큰 원문
 */
public record EmailVerificationConfirmRequest(
        @NotBlank
        @Size(max = 200)
        String token
) {
}
