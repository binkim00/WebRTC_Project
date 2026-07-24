package com.ssafy.backend.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 로그인 ID와 평문 비밀번호를 전달받는 로그인 요청 DTO다. */
public record LoginRequest(
        @NotBlank @Size(max = 100) String loginId,
        @NotBlank String password
) {
}
