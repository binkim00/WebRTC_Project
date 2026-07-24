package com.ssafy.backend.auth.service;

import com.ssafy.backend.auth.jwt.RevokedAccessTokenStore;
import org.springframework.stereotype.Service;

/** 로그아웃된 Access Token을 폐기하여 남은 유효시간 동안 재사용을 차단한다. */
@Service
public class LogoutService {
    private final RevokedAccessTokenStore revokedAccessTokenStore;

    /**
     * 폐기된 Access Token 저장소를 주입받는다.
     *
     * @param revokedAccessTokenStore 로그아웃 토큰 저장소
     */
    public LogoutService(RevokedAccessTokenStore revokedAccessTokenStore) {
        this.revokedAccessTokenStore = revokedAccessTokenStore;
    }

    /**
     * 현재 요청에 사용된 Access Token을 폐기한다.
     *
     * @param accessToken 로그아웃 처리할 Access Token
     */
    public void logout(String accessToken) {
        revokedAccessTokenStore.revoke(accessToken);
    }
}
