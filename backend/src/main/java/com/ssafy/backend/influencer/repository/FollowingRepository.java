package com.ssafy.backend.influencer.repository;

import com.ssafy.backend.influencer.domain.Following;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 팔로잉 관계 영속성 처리를 담당한다.
 */
public interface FollowingRepository extends JpaRepository<Following, Long> {
}
