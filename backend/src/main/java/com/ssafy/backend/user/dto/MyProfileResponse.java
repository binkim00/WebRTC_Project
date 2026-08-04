package com.ssafy.backend.user.dto;

import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;

/**
 * 현재 로그인한 사용자의 공통 회원 정보를 전달한다.
 *
 * <p>인증 완료 시각은 화면 동작에 필요하지 않아 담지 않는다. 시각이 필요하면
 * 이메일 인증 상태 조회(AUTH-008)를 사용한다.
 *
 * @param userId 사용자 식별자
 * @param loginId 로그인 ID
 * @param email 이메일
 * @param nickname 닉네임
 * @param profileImageUrl 프로필 이미지 URL
 * @param role 사용자 역할
 * @param preferredLanguage 선호 언어
 * @param emailVerified 이메일 인증 완료 여부
 */
public record MyProfileResponse(
        Long userId,
        String loginId,
        String email,
        String nickname,
        String profileImageUrl,
        UserRole role,
        PreferredLanguage preferredLanguage,
        boolean emailVerified
) {
    /**
     * 사용자 엔티티를 내 정보 조회 응답으로 변환한다.
     *
     * @param user 변환할 활성 사용자
     * @return 공개 가능한 공통 회원 정보
     */
    public static MyProfileResponse from(User user) {
        return new MyProfileResponse(
                user.getId(),
                user.getLoginId(),
                user.getEmail(),
                user.getNickname(),
                user.getProfileImageUrl(),
                user.getRole(),
                user.getPreferredLanguage(),
                user.isEmailVerified()
        );
    }
}
