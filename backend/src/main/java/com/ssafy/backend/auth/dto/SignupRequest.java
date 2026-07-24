package com.ssafy.backend.auth.dto;

import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.UserRole;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record SignupRequest(
        @NotBlank @Size(max = 100) String loginId,
        @NotBlank @Size(min = 8, max = 72) String password,
        @NotBlank @Email @Size(max = 255) String email,
        @NotBlank @Size(max = 50) String nickname,
        @NotNull UserRole role,
        @NotNull PreferredLanguage preferredLanguage,
        @NotNull @AssertTrue Boolean termsOfServiceAgreed,
        @NotNull @AssertTrue Boolean privacyPolicyAgreed
) {
    /** 시스템 관리자 역할이 일반 회원가입 경로로 생성되는 것을 차단한다. */
    @AssertTrue
    public boolean isRoleAllowedForSignup() {
        return role == null || role.isSignupAllowed();
    }
}
