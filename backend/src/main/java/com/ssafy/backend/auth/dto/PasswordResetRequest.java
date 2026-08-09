package com.ssafy.backend.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 비밀번호 재설정 메일 발송 요청이다.
 *
 * <p>로그인 ID가 아니라 이메일만 받는다. 비밀번호를 잊은 사람은 아이디도 함께 잊었을 수 있고,
 * 메일을 받아야 다음 단계로 갈 수 있으므로 확인할 수 있는 값은 어차피 이메일뿐이다.
 *
 * @param email 가입할 때 등록한 이메일
 */
public record PasswordResetRequest(
        @NotBlank @Email @Size(max = 255) String email
) {
}
