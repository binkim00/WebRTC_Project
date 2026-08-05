package com.ssafy.backend.auth.dto;

import com.ssafy.backend.auth.domain.SocialProvider;

/**
 * 소셜 로그인 시도의 결과와 다음 단계에 필요한 정보를 함께 담는다.
 *
 * <p>{@code message}를 서버가 만들어 내려보낸다. 어느 공급자에서 어떤 이유로 다음 단계가 필요한지는
 * 서버만 알고 있어서, 프론트가 같은 문구를 다시 조립하면 두 곳이 어긋난다.
 *
 * @param status 처리 결과이며 프론트는 이 값으로 화면을 분기한다
 * @param message 화면에 그대로 띄울 안내 문구
 * @param login {@link SocialLoginStatus#LOGIN}일 때의 토큰과 사용자 정보이며 그 외에는 {@code null}
 * @param socialToken 다음 단계 요청에 함께 보낼 임시 토큰이며 {@code LOGIN}일 때는 {@code null}
 * @param provider 인증을 마친 소셜 공급자
 * @param email 추가정보 화면에 채워 줄 공급자 이메일이며 받지 못했으면 {@code null}
 * @param emailProvided 공급자가 이메일을 알려 주었는지 여부이며 거짓이면 화면에서 직접 입력받아야 한다
 * @param maskedEmail 기존 계정 안내에 쓸 가려진 이메일이며 {@code LINK_REQUIRED}일 때만 채워진다
 */
public record SocialLoginResponse(
        SocialLoginStatus status,
        String message,
        LoginResponse login,
        String socialToken,
        SocialProvider provider,
        String email,
        boolean emailProvided,
        String maskedEmail
) {

    /**
     * 이미 연결된 계정의 로그인 성공 응답을 만든다.
     *
     * @param provider 로그인에 사용한 소셜 공급자
     * @param login 발급된 토큰과 사용자 정보
     * @return 추가 화면이 필요 없는 로그인 응답
     */
    public static SocialLoginResponse login(SocialProvider provider, LoginResponse login) {
        return new SocialLoginResponse(
                SocialLoginStatus.LOGIN, null, login, null, provider, null, false, null);
    }

    /**
     * 추가정보 입력이 필요한 신규 가입 응답을 만든다.
     *
     * @param provider 인증을 마친 소셜 공급자
     * @param socialToken 가입 요청에 함께 보낼 임시 토큰
     * @param email 공급자가 알려 준 이메일이며 없으면 {@code null}
     * @param message 화면에 띄울 안내 문구
     * @return 추가정보 화면으로 보낼 응답
     */
    public static SocialLoginResponse signupRequired(SocialProvider provider, String socialToken,
                                                     String email, String message) {
        return new SocialLoginResponse(
                SocialLoginStatus.SIGNUP_REQUIRED, message, null, socialToken, provider,
                email, email != null && !email.isBlank(), null);
    }

    /**
     * 기존 계정 연결이 필요한 응답을 만든다.
     *
     * @param provider 인증을 마친 소셜 공급자
     * @param socialToken 연결 요청에 함께 보낼 임시 토큰
     * @param maskedEmail 안내에 사용할 가려진 이메일
     * @param message 화면에 띄울 안내 문구
     * @return 비밀번호 확인 화면으로 보낼 응답
     */
    public static SocialLoginResponse linkRequired(SocialProvider provider, String socialToken,
                                                   String maskedEmail, String message) {
        return new SocialLoginResponse(
                SocialLoginStatus.LINK_REQUIRED, message, null, socialToken, provider,
                null, true, maskedEmail);
    }
}
