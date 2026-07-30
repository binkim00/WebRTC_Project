package com.ssafy.backend.user.dto;

import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;

import java.time.LocalDateTime;

/**
 * 내 정보 부분 수정 후 저장된 값을 전달한다.
 *
 * @param userId 사용자 식별자
 * @param email 수정 후 이메일
 * @param nickname 수정 후 닉네임
 * @param profileImageUrl 수정 후 프로필 이미지 URL
 * @param preferredLanguage 수정 후 선호 언어
 * @param updatedAt 수정 완료 시각
 */
public record MyProfileUpdateResponse(
        Long userId,
        String email,
        String nickname,
        String profileImageUrl,
        PreferredLanguage preferredLanguage,
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
                user.getUpdatedAt()
        );
    }
}
