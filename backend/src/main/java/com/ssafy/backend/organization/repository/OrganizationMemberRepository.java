package com.ssafy.backend.organization.repository;

import com.ssafy.backend.organization.domain.OrganizationMember;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 조직 구성원 영속성 처리를 담당한다.
 */
public interface OrganizationMemberRepository extends JpaRepository<OrganizationMember, Long> {
}
