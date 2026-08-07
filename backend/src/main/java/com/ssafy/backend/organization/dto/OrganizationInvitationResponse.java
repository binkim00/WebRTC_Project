package com.ssafy.backend.organization.dto;

import java.time.LocalDateTime;

/**
 * 새로 발급한 조직 초대 토큰과 만료 정보를 전달한다.
 *
 * @param organizationId 초대 조직 식별자
 * @param influencerId 초대 대상 인플루언서 식별자
 * @param token 한 번만 노출하는 원본 초대 토큰
 * @param expiresAt 초대 만료 시각
 */
public record OrganizationInvitationResponse(
        Long organizationId,
        Long influencerId,
        String token,
        LocalDateTime expiresAt
) {
}
