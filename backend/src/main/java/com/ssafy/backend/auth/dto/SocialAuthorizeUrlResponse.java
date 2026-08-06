package com.ssafy.backend.auth.dto;

import com.ssafy.backend.auth.domain.SocialProvider;

/**
 * 브라우저를 이동시킬 공급자 인증 화면 주소를 담는다.
 *
 * @param provider 대상 소셜 공급자
 * @param authorizeUrl 브라우저 주소창을 이 값으로 이동시키면 공급자 로그인·동의 화면이 열린다
 */
public record SocialAuthorizeUrlResponse(
        SocialProvider provider,
        String authorizeUrl
) {
}
