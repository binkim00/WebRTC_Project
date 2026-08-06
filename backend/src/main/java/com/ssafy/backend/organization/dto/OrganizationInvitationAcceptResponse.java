package com.ssafy.backend.organization.dto;

/**
 * 조직 초대 수락으로 확정된 조직과 소속 정보를 전달한다.
 *
 * @param organization 조직 기본 정보
 * @param member 생성되거나 재활성화된 조직 소속 정보
 */
public record OrganizationInvitationAcceptResponse(
        OrganizationResponse organization,
        OrganizationMemberResponse member
) {
}
