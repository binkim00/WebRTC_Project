package com.ssafy.backend.organization.dto;

import java.util.List;

/**
 * 현재 사용자의 활성 조직과 구성원 목록을 전달한다.
 *
 * @param organization 조직 기본 정보
 * @param members 활성 조직 구성원 목록
 */
public record MyOrganizationMembersResponse(
        OrganizationResponse organization,
        List<OrganizationMemberResponse> members
) {
}
