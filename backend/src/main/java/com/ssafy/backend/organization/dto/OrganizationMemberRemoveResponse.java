package com.ssafy.backend.organization.dto;

import com.ssafy.backend.organization.domain.OrganizationMember;
import com.ssafy.backend.organization.domain.OrganizationMemberStatus;

import java.time.LocalDateTime;

/**
 * 조직 구성원의 소속 종료 결과를 전달한다.
 *
 * @param organizationId 조직 식별자
 * @param userId 소속이 종료된 사용자 식별자
 * @param status 변경된 소속 상태
 * @param leftAt 소속 종료 시각
 */
public record OrganizationMemberRemoveResponse(
        Long organizationId,
        Long userId,
        OrganizationMemberStatus status,
        LocalDateTime leftAt
) {
    /**
     * 비활성화된 조직 소속을 종료 응답으로 변환한다.
     *
     * @param member 비활성화된 조직 소속
     * @return 조직 소속 종료 응답
     */
    public static OrganizationMemberRemoveResponse from(OrganizationMember member) {
        return new OrganizationMemberRemoveResponse(
                member.getOrganization().getId(),
                member.getUser().getId(),
                member.getStatus(),
                member.getLeftAt()
        );
    }
}
