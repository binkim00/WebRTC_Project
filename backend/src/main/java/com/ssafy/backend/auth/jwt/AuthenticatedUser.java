package com.ssafy.backend.auth.jwt;

import com.ssafy.backend.user.domain.UserRole;

/** 검증된 Access Token에서 추출해 SecurityContext의 principal로 사용하는 사용자 정보다. */
public record AuthenticatedUser(Long userId, UserRole role) {
}
