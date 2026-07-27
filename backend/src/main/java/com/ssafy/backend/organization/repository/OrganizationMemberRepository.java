package com.ssafy.backend.organization.repository;

import com.ssafy.backend.organization.domain.OrganizationMember;
import com.ssafy.backend.organization.domain.OrganizationMemberStatus;
import com.ssafy.backend.organization.domain.OrganizationMemberType;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 조직 구성원 영속성 처리를 담당한다.
 */
public interface OrganizationMemberRepository extends JpaRepository<OrganizationMember, Long> {
    /** 사용자가 조직의 활성 구성원인지 확인한다. */
    boolean existsByOrganization_IdAndUser_IdAndStatus(
            Long organizationId, Long userId, OrganizationMemberStatus status);

    /** 사용자가 조직의 활성 매니저 구성원인지 확인한다. */
    boolean existsByOrganization_IdAndUser_IdAndMemberTypeAndStatus(
            Long organizationId, Long userId, OrganizationMemberType memberType,
            OrganizationMemberStatus status);
}
