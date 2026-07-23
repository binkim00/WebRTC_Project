package com.ssafy.backend.user.domain;

public enum UserRole {
    FAN,
    INFLUENCER,
    MANAGER,
    SOLO_INFLUENCER,
    ADMIN;

    /** 일반 회원가입 API에서 선택할 수 있는 역할인지 확인한다. */
    public boolean isSignupAllowed() {
        return this != ADMIN;
    }
}
