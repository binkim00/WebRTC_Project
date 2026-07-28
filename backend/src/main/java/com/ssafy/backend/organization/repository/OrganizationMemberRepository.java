package com.ssafy.backend.organization.repository;

import com.ssafy.backend.organization.domain.OrganizationMember;
import com.ssafy.backend.organization.domain.OrganizationMemberStatus;
import com.ssafy.backend.organization.domain.OrganizationMemberType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * 조직 구성원 영속성 처리를 담당한다.
 */
public interface OrganizationMemberRepository extends JpaRepository<OrganizationMember, Long> {

    List<OrganizationMember> findAllByUserIdAndMemberTypeAndStatus(
            Long userId,
            OrganizationMemberType memberType,
            OrganizationMemberStatus status
    );

    boolean existsByOrganizationIdAndUserIdAndMemberTypeAndStatus(
            Long organizationId,
            Long userId,
            OrganizationMemberType memberType,
            OrganizationMemberStatus status
    );
}
