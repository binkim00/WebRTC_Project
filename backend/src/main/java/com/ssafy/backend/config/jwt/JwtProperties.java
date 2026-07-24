package com.ssafy.backend.config.jwt;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/** JWT 서명 비밀값과 Access·Refresh Token 만료시간 설정을 바인딩한다. */
@Validated
@ConfigurationProperties(prefix = "jwt")
public record JwtProperties(
        @NotBlank String secret,
        @Positive long accessExpiration,
        @Positive long refreshExpiration
) {
}
