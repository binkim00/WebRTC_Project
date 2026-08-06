package com.ssafy.backend.organization.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

/**
 * 가입된 인플루언서를 조직에 직접 연결하는 요청이다.
 *
 * @param userId 연결할 인플루언서의 사용자 식별자
 */
public record OrganizationMemberAddRequest(
        @NotNull @Positive Long userId
) {
}
