package com.ssafy.backend.auth.jwt;

/** 로그인 과정에서 함께 발급한 Access Token, Refresh Token과 Access Token 유효시간을 담는다. */
public record IssuedTokens(String accessToken, String refreshToken, long expiresIn) {
}
