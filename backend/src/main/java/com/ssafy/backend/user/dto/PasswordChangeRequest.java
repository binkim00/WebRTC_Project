package com.ssafy.backend.user.dto;

import com.ssafy.backend.auth.support.PasswordPolicy;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 로그인한 사용자의 비밀번호 변경 요청이다.
 *
 * <p>Access Token만으로는 화면을 잠시 빌려 쓴 사람과 본인을 구분할 수 없어 현재 비밀번호를 함께 받는다.
 *
 * @param currentPassword 본인 확인용 현재 비밀번호
 * @param newPassword 새로 설정할 비밀번호
 */
public record PasswordChangeRequest(
        @NotBlank String currentPassword,
        @NotBlank @Size(min = PasswordPolicy.MIN_LENGTH, max = PasswordPolicy.MAX_LENGTH)
        String newPassword
) {
}
