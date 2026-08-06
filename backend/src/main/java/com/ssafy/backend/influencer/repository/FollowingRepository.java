package com.ssafy.backend.influencer.repository;

import com.ssafy.backend.influencer.domain.Following;
import com.ssafy.backend.user.domain.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * 팔로잉 관계 영속성 처리를 담당한다.
 */
public interface FollowingRepository extends JpaRepository<Following, Long> {

    /** 팬과 인플루언서 사이에 팔로우 관계가 존재하는지 확인한다. */
    boolean existsByFollower_IdAndFollowedInfluencer_Id(Long followerId, Long influencerId);

    /** 팬과 인플루언서 사이의 팔로우 관계를 조회한다. */
    Optional<Following> findByFollower_IdAndFollowedInfluencer_Id(
            Long followerId, Long influencerId
    );

    /** 팬이 팔로우하는 인플루언서 관계를 최신순으로 조회한다. */
    @EntityGraph(attributePaths = "followedInfluencer")
    Page<Following> findAllByFollower_IdOrderByCreatedAtDescIdDesc(
            Long followerId, Pageable pageable
    );

    /** 인플루언서를 팔로우하는 팬 관계를 최신순으로 조회한다. */
    @EntityGraph(attributePaths = "follower")
    Page<Following> findAllByFollowedInfluencer_IdOrderByCreatedAtDescIdDesc(
            Long influencerId, Pageable pageable
    );

    /** 인플루언서의 현재 팔로워 수를 집계한다. */
    long countByFollowedInfluencer_Id(Long influencerId);

    /**
     * 인플루언서를 팔로우하는 활성 팬 계정을 식별자 순서로 모두 조회한다.
     *
     * <p>새 팬미팅 공개 알림처럼 팔로워 전원에게 한 번에 보내는 작업에 쓴다. 알림 문구는 받는
     * 사람의 선호 언어로 만들어야 하므로 관계가 아니라 팬 계정을 바로 가져와, 지연 로딩으로
     * 조회가 팔로워 수만큼 늘어나지 않게 한다. 탈퇴·정지 계정은 알림을 받을 수 없으므로 뺀다.
     *
     * @param influencerId 인플루언서 사용자 식별자
     * @return 활성 상태인 팔로워 팬 목록이며 팔로워가 없으면 빈 목록
     */
    @Query("""
            select following.follower
            from Following following
            where following.followedInfluencer.id = :influencerId
              and following.follower.status = com.ssafy.backend.user.domain.UserStatus.ACTIVE
            order by following.follower.id
            """)
    List<User> findActiveFollowers(@Param("influencerId") Long influencerId);
}
