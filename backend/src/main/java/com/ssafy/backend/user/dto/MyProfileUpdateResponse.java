package com.ssafy.backend.user.dto;

import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;

import java.time.LocalDateTime;

/**
 * 내 정보 부분 수정 후 저장된 값을 전달한다.
 *
 * <p>이메일을 다른 주소로 바꾸면 기존 인증이 무효가 되므로 {@code emailVerified}를 함께 내려보낸다.
 * 프론트가 이 응답만으로 재인증 안내 화면을 띄울 수 있어야 한다.
 *
 * @param userId 사용자 식별자
 * @param email 수정 후 이메일
 * @param nickname 수정 후 닉네임
 * @param profileImageUrl 수정 후 프로필 이미지 URL
 * @param preferredLanguage 수정 후 선호 언어
 * @param emailVerified 수정 후 이메일 인증 완료 여부
 * @param updatedAt 수정 완료 시각
 */
public record MyProfileUpdateResponse(
        Long userId,
        String email,
        String nickname,
        String profileImageUrl,
        PreferredLanguage preferredLanguage,
        boolean emailVerified,
        LocalDateTime updatedAt
) {
    /**
     * 저장된 사용자 엔티티를 내 정보 수정 응답으로 변환한다.
     *
     * @param user 수정이 완료된 사용자
     * @return 수정 후 공개 회원 정보
     */
    public static MyProfileUpdateResponse from(User user) {
        return new MyProfileUpdateResponse(
                user.getId(),
                user.getEmail(),
                user.getNickname(),
                user.getProfileImageUrl(),
                user.getPreferredLanguage(),
                user.isEmailVerified(),
                user.getUpdatedAt()
        );
    }
}
