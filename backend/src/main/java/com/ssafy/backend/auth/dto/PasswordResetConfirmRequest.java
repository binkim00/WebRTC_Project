package com.ssafy.backend.auth.dto;

import com.ssafy.backend.auth.support.PasswordPolicy;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 재설정 링크의 토큰으로 새 비밀번호를 확정하는 요청이다.
 *
 * <p>길이만 여기서 막고 구성 규칙(영문·숫자 포함)은 {@link PasswordPolicy}가 검사한다.
 * 규칙 위반은 다른 검증 실패와 구분되는 안내 문구가 필요하기 때문이다.
 *
 * @param token 메일 링크에 담겨 있던 토큰 원문
 * @param newPassword 새로 설정할 비밀번호
 */
public record PasswordResetConfirmRequest(
        @NotBlank String token,
        @NotBlank @Size(min = PasswordPolicy.MIN_LENGTH, max = PasswordPolicy.MAX_LENGTH)
        String newPassword
) {
}
