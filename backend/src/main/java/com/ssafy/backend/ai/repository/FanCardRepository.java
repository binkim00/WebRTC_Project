package com.ssafy.backend.ai.repository;

import com.ssafy.backend.ai.domain.FanCard;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 팬 카드 영속성 처리를 담당한다.
 */
public interface FanCardRepository extends JpaRepository<FanCard, Long> {
}
