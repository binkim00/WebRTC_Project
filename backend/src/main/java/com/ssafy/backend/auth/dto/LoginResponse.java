package com.ssafy.backend.auth.dto;

import com.ssafy.backend.auth.jwt.IssuedTokens;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;

/** 로그인 성공 후 발급된 토큰과 화면에 필요한 사용자 정보를 반환하는 응답 DTO다. */
public record LoginResponse(
        String accessToken,
        String refreshToken,
        long expiresIn,
        Long userId,
        UserRole role,
        String nickname
) {
    /** 인증된 사용자와 발급된 토큰을 최종 로그인 응답 형식으로 변환한다. */
    public static LoginResponse of(User user, IssuedTokens tokens) {
        return new LoginResponse(
                tokens.accessToken(),
                tokens.refreshToken(),
                tokens.expiresIn(),
                user.getId(),
                user.getRole(),
                user.getNickname()
        );
    }
}
