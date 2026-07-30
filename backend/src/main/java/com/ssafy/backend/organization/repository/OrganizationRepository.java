package com.ssafy.backend.organization.repository;

import com.ssafy.backend.organization.domain.Organization;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 조직 영속성 처리를 담당한다.
 */
public interface OrganizationRepository extends JpaRepository<Organization, Long> {

    /**
     * 동일한 사업자등록번호를 가진 조직이 존재하는지 확인한다.
     *
     * @param businessNumber 확인할 사업자등록번호
     * @return 중복 조직 존재 여부
     */
    boolean existsByBusinessNumber(String businessNumber);
}
