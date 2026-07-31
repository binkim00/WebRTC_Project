package com.ssafy.backend.auth.service;

import com.ssafy.backend.auth.jwt.RevokedAccessTokenStore;
import com.ssafy.backend.auth.jwt.JwtTokenProvider;
import com.ssafy.backend.auth.jwt.TokenSessionStore;
import org.springframework.stereotype.Service;

/** 로그아웃된 Access Token을 폐기하여 남은 유효시간 동안 재사용을 차단한다. */
@Service
public class LogoutService {
    private final RevokedAccessTokenStore revokedAccessTokenStore;
    private final JwtTokenProvider jwtTokenProvider;
    private final TokenSessionStore tokenSessionStore;

    /**
     * JWT 제공자, 폐기 Access Token 저장소와 현재 토큰 세션 저장소를 주입받는다.
     *
     * @param revokedAccessTokenStore 로그아웃 토큰 저장소
     * @param jwtTokenProvider Access Token 검증기
     * @param tokenSessionStore 현재 토큰 세션 저장소
     */
    public LogoutService(RevokedAccessTokenStore revokedAccessTokenStore,
                         JwtTokenProvider jwtTokenProvider,
                         TokenSessionStore tokenSessionStore) {
        this.revokedAccessTokenStore = revokedAccessTokenStore;
        this.jwtTokenProvider = jwtTokenProvider;
        this.tokenSessionStore = tokenSessionStore;
    }

    /**
     * 현재 요청에 사용된 Access Token을 폐기한다.
     *
     * @param accessToken 로그아웃 처리할 Access Token
     */
    public void logout(String accessToken) {
        Long userId = jwtTokenProvider.parseAccessToken(accessToken).userId();
        tokenSessionStore.delete(userId);
        revokedAccessTokenStore.revoke(accessToken);
    }
}
