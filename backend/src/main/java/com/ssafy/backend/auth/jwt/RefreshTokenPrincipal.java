package com.ssafy.backend.auth.jwt;

/** 검증된 Refresh Token에서 추출한 사용자 식별자를 담는다. */
public record RefreshTokenPrincipal(Long userId) {
}
