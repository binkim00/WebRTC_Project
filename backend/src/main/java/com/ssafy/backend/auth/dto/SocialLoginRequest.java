package com.ssafy.backend.auth.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 브라우저 콜백에서 받은 인증 코드로 소셜 로그인을 요청한다.
 *
 * <p>공급자 access token 을 프론트에서 받아 넘기지 않고 인증 코드만 받는다. 토큰을 넘기는 방식은
 * 다른 앱에서 발급된 토큰으로도 로그인이 되는 토큰 주입 공격이 열린다.
 *
 * @param code 공급자가 콜백 주소로 전달한 1회용 인증 코드
 * @param state 프론트가 만들어 인증 요청에 실었던 CSRF 방어용 값이며 네이버 토큰 교환에 필요하다
 */
public record SocialLoginRequest(
        @NotBlank String code,
        String state
) {
}
