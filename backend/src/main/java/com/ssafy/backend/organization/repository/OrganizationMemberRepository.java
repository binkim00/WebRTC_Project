package com.ssafy.backend.organization.repository;

import com.ssafy.backend.organization.domain.OrganizationMember;
import com.ssafy.backend.organization.domain.OrganizationMemberStatus;
import com.ssafy.backend.organization.domain.OrganizationMemberType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;

import java.util.List;
import java.util.Optional;

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

    /**
     * 사용자의 활성 조직 소속 한 건을 조회한다.
     *
     * @param userId 사용자 식별자
     * @param status 소속 상태
     * @return 활성 조직 소속
     */
    @EntityGraph(attributePaths = {"organization", "user"})
    Optional<OrganizationMember> findFirstByUser_IdAndStatus(
            Long userId,
            OrganizationMemberStatus status
    );

    /**
     * 조직과 사용자로 소속 이력을 조회한다.
     *
     * @param organizationId 조직 식별자
     * @param userId 사용자 식별자
     * @return 조직 소속 이력
     */
    @EntityGraph(attributePaths = {"organization", "user"})
    Optional<OrganizationMember> findByOrganization_IdAndUser_Id(
            Long organizationId,
            Long userId
    );

    /**
     * 조직의 특정 상태 구성원을 가입 순서로 조회한다.
     *
     * @param organizationId 조직 식별자
     * @param status 소속 상태
     * @return 조직 구성원 목록
     */
    @EntityGraph(attributePaths = {"organization", "user"})
    List<OrganizationMember> findAllByOrganization_IdAndStatusOrderByJoinedAtAscIdAsc(
            Long organizationId,
            OrganizationMemberStatus status
    );
}
