package com.ssafy.backend.auth.dto;

import com.ssafy.backend.user.domain.PreferredLanguage;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 소셜 인증을 마친 사용자의 신규 가입 요청이다.
 *
 * <p>{@code role}이 없다. 소셜 가입으로 만들 수 있는 역할은 {@code FAN}으로 고정하며 서버가 결정한다.
 * 인플루언서·매니저는 조직 초대 흐름과 얽혀 있어 소셜 가입 경로로 만들면 권한 정책이 무너진다.
 *
 * <p>비밀번호도 받지 않는다. 소셜 전용 계정은 비밀번호로 로그인하지 않으며
 * {@code users.password_hash}에는 어떤 비밀번호와도 일치하지 않는 값이 들어간다.
 *
 * @param socialToken 소셜 로그인 응답으로 받은 임시 토큰
 * @param nickname 사용자가 정한 표시 이름
 * @param email 공급자가 이메일을 알려 주지 않은 경우에만 사용자가 직접 입력한 이메일
 * @param preferredLanguage 영상 번역 기본 언어로 사용할 선호 언어
 * @param termsOfServiceAgreed 이용약관 동의 여부
 * @param privacyPolicyAgreed 개인정보 처리방침 동의 여부
 */
public record SocialSignupRequest(
        @NotBlank String socialToken,
        @NotBlank @Size(max = 50) String nickname,
        @Email @Size(max = 255) String email,
        @NotNull PreferredLanguage preferredLanguage,
        @NotNull @AssertTrue Boolean termsOfServiceAgreed,
        @NotNull @AssertTrue Boolean privacyPolicyAgreed
) {
}
