package com.ssafy.backend.auth.service;

import com.ssafy.backend.auth.jwt.RevokedAccessTokenStore;
import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

/** 로그아웃 서비스가 Access Token 폐기를 저장소에 위임하는지 검증한다. */
class LogoutServiceTest {

    /** 전달받은 Access Token을 폐기 토큰 저장소에 기록하는지 확인한다. */
    @Test
    void revokesCurrentAccessToken() {
        RevokedAccessTokenStore store = mock(RevokedAccessTokenStore.class);
        LogoutService logoutService = new LogoutService(store);

        logoutService.logout("access-token");

        verify(store).revoke("access-token");
    }
}
