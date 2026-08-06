package com.ssafy.backend.auth.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 같은 이메일로 이미 가입한 계정에 소셜 계정을 연결하는 요청이다.
 *
 * <p>이메일이 같다는 사실만으로 자동 연결하지 않고 비밀번호를 받는다. 공급자 이메일은 우리 계정의
 * 소유를 증명하지 않으므로 자동 연결은 그대로 계정 탈취 경로가 된다.
 *
 * @param socialToken 소셜 로그인 응답으로 받은 임시 토큰
 * @param password 연결 대상 계정의 비밀번호
 */
public record SocialLinkRequest(
        @NotBlank String socialToken,
        @NotBlank String password
) {
}
