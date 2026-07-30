package com.ssafy.backend.influencer.repository;

import com.ssafy.backend.influencer.domain.InfluencerProfile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

/**
 * 인플루언서 프로필 영속성 처리를 담당한다.
 */
public interface InfluencerProfileRepository extends JpaRepository<InfluencerProfile, Long> {

    /** 여러 인플루언서 사용자의 공개 프로필을 한 번에 조회한다. */
    List<InfluencerProfile> findAllByUser_IdIn(Collection<Long> userIds);
}
