package com.ssafy.backend.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Access·Refresh Token 재발급에 사용할 Refresh Token 요청 DTO다. */
public record RefreshTokenRequest(@NotBlank @Size(max = 4096) String refreshToken) {
}
