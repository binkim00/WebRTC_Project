package com.ssafy.backend.organization.repository;

import com.ssafy.backend.organization.domain.Organization;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 조직 영속성 처리를 담당한다.
 */
public interface OrganizationRepository extends JpaRepository<Organization, Long> {
}
