package com.ssafy.backend.organization.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

/**
 * 조직에 초대할 인플루언서를 지정한다.
 *
 * @param influencerId 초대 대상 인플루언서의 사용자 식별자
 */
public record OrganizationInvitationCreateRequest(
        @NotNull @Positive Long influencerId
) {
}
