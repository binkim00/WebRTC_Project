package com.ssafy.backend.influencer.repository;

import com.ssafy.backend.influencer.domain.Following;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

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
}
