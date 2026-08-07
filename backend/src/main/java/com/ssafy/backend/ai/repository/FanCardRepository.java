package com.ssafy.backend.ai.repository;

import com.ssafy.backend.ai.domain.FanCard;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/**
 * 팬 카드 영속성 처리를 담당한다.
 */
public interface FanCardRepository extends JpaRepository<FanCard, Long> {

    /**
     * 통화 세션에 저장된 기념 카드를 조회한다.
     *
     * <p>카드는 통화 세션당 한 장만 존재하므로 재선택 시 이 결과의 문구를 바꾼다.
     *
     * @param callSessionId 통화 세션 식별자
     * @return 저장된 기념 카드 (없으면 empty)
     */
    Optional<FanCard> findByCallSession_Id(Long callSessionId);
}
