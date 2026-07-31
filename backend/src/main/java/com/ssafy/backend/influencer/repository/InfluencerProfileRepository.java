package com.ssafy.backend.influencer.repository;

import com.ssafy.backend.influencer.domain.InfluencerProfile;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 인플루언서 프로필 영속성 처리를 담당한다.
 */
public interface InfluencerProfileRepository extends JpaRepository<InfluencerProfile, Long> {
}
