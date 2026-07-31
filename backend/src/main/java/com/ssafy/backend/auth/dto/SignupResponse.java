package com.ssafy.backend.auth.dto;

import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;

import java.time.LocalDateTime;

public record SignupResponse(Long userId, UserRole role, LocalDateTime createdAt) {
    /** 저장된 User 엔티티를 외부에 노출할 회원가입 응답 형태로 변환한다. */
    public static SignupResponse from(User user) {
        return new SignupResponse(user.getId(), user.getRole(), user.getCreatedAt());
    }
}
