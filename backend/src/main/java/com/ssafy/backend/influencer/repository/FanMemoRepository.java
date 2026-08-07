package com.ssafy.backend.influencer.repository;

import com.ssafy.backend.influencer.domain.FanMemo;
import com.ssafy.backend.organization.domain.OrganizationMemberStatus;
import com.ssafy.backend.organization.domain.OrganizationMemberType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.Optional;

/**
 * 팬 메모 영속성 처리를 담당한다.
 */
public interface FanMemoRepository extends JpaRepository<FanMemo, Long> {

    /**
     * 인플루언서 본인이 특정 팬에 대해 작성한 삭제되지 않은 메모를 최신순으로 페이지 조회한다.
     * 같은 팬에게 여러 인플루언서가 메모를 남길 수 있으므로 작성자 조건을 반드시 함께 건다.
     * 응답에 회차 제목이 필요해 회차를 함께 조회하여 N+1을 막는다.
     *
     * @param influencerId 작성자인 인플루언서의 식별자
     * @param fanId 조회 대상 팬의 식별자
     * @param pageable 페이지 요청 정보
     * @return 작성 시각 내림차순, 같은 시각에는 식별자 내림차순으로 정렬된 메모 페이지
     */
    @EntityGraph(attributePaths = {"meeting"})
    Page<FanMemo> findByInfluencer_IdAndFan_IdAndDeletedAtIsNullOrderByCreatedAtDescIdDesc(
            Long influencerId, Long fanId, Pageable pageable);

    /**
     * 매니저가 속한 활성 조직의 인플루언서가 특정 팬에 대해 작성한 메모를 최신순으로 페이지 조회한다.
     * 전역 관리자 조회가 되지 않도록 조직 식별자 집합으로 작성자 범위를 제한한다.
     *
     * @param fanId 조회 대상 팬의 식별자
     * @param organizationIds 조회를 요청한 매니저가 활성 상태로 속한 조직 식별자 집합
     * @param memberType 작성자가 조직에서 가져야 하는 구성원 유형
     * @param memberStatus 작성자의 조직 소속 상태
     * @param pageable 페이지 요청 정보
     * @return 작성 시각 내림차순, 같은 시각에는 식별자 내림차순으로 정렬된 메모 페이지
     */
    @EntityGraph(attributePaths = {"meeting"})
    @Query(value = "select memo from FanMemo memo "
            + "where memo.fan.id = :fanId "
            + "and memo.deletedAt is null "
            + "and exists (select 1 from OrganizationMember member "
            + "where member.user.id = memo.influencer.id "
            + "and member.organization.id in :organizationIds "
            + "and member.memberType = :memberType "
            + "and member.status = :memberStatus) "
            + "order by memo.createdAt desc, memo.id desc",
            countQuery = "select count(memo) from FanMemo memo "
                    + "where memo.fan.id = :fanId "
                    + "and memo.deletedAt is null "
                    + "and exists (select 1 from OrganizationMember member "
                    + "where member.user.id = memo.influencer.id "
                    + "and member.organization.id in :organizationIds "
                    + "and member.memberType = :memberType "
                    + "and member.status = :memberStatus)")
    Page<FanMemo> findOrganizationScopedByFan(
            @Param("fanId") Long fanId,
            @Param("organizationIds") Collection<Long> organizationIds,
            @Param("memberType") OrganizationMemberType memberType,
            @Param("memberStatus") OrganizationMemberStatus memberStatus,
            Pageable pageable);

    /**
     * 수정·삭제 대상 메모를 회차 정보와 함께 조회한다.
     * 이미 삭제된 메모를 없는 메모와 구분해 응답하기 위해 삭제 조건은 걸지 않는다.
     *
     * @param memoId 메모 식별자
     * @return 소프트 삭제 여부와 무관하게 존재하는 메모이며 없으면 빈 값
     */
    @EntityGraph(attributePaths = {"meeting"})
    Optional<FanMemo> findWithMeetingById(Long memoId);
}
