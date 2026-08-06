package com.ssafy.backend.user.dto;

import com.ssafy.backend.user.domain.PreferredLanguage;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 현재 사용자가 부분 수정할 수 있는 공통 회원 정보를 전달한다.
 *
 * @param nickname 변경할 닉네임
 * @param email 변경할 이메일
 * @param profileImageUrl 변경할 프로필 이미지 URL
 * @param preferredLanguage 변경할 선호 언어
 */
public record MyProfileUpdateRequest(
        @Size(max = 50)
        @Pattern(regexp = ".*\\S.*")
        String nickname,

        @Email
        @Size(max = 255)
        @Pattern(regexp = ".*\\S.*")
        String email,

        @Size(max = 2048)
        @Pattern(regexp = "https?://\\S+")
        String profileImageUrl,

        PreferredLanguage preferredLanguage
) {
}
