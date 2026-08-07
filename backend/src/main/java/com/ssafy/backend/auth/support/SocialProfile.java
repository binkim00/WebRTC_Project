package com.ssafy.backend.auth.support;

import com.ssafy.backend.auth.domain.SocialProvider;

/**
 * 소셜 공급자에서 받아온 사용자 정보를 공급자 차이를 지운 형태로 담는다.
 *
 * <p>공급자마다 응답 구조가 전혀 다르다. 구글은 {@code sub}, 카카오는 {@code id},
 * 네이버는 {@code response.id}를 쓰고 이메일 인증 여부도 구글 {@code email_verified},
 * 카카오 {@code is_email_verified}, 네이버는 아예 없다. 서비스 계층이 이 차이를 알 필요가 없도록
 * 여기서 한 형태로 정규화한다.
 *
 * @param provider 이 정보를 준 소셜 공급자
 * @param providerUserId 공급자가 발급한 변하지 않는 사용자 식별자
 * @param email 공급자가 알려 준 이메일이며 동의를 받지 못하면 {@code null}
 * @param emailVerified 공급자가 이메일 소유를 확인했다고 볼 수 있는지 여부
 * @param nickname 공급자가 알려 준 표시 이름이며 없으면 {@code null}
 * @param profileImageUrl 공급자가 알려 준 프로필 이미지 주소이며 없으면 {@code null}
 */
public record SocialProfile(
        SocialProvider provider,
        String providerUserId,
        String email,
        boolean emailVerified,
        String nickname,
        String profileImageUrl
) {

    /** 공급자로부터 사용할 수 있는 이메일을 받았는지 반환한다. */
    public boolean hasEmail() {
        return email != null && !email.isBlank();
    }
}
