package com.ssafy.backend.auth.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 메일 링크에 담긴 인증 토큰으로 이메일 소유를 확인하는 요청이다.
 *
 * @param token 인증 메일 링크의 token 쿼리 값
 */
public record EmailVerificationConfirmRequest(
        @NotBlank String token
) {
}
