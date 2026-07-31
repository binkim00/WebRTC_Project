package com.ssafy.backend.ai.repository;

import com.ssafy.backend.ai.domain.AiCallSummary;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/**
 * AI 통화 요약 영속성 처리를 담당한다.
 * 요약 생성과 저장은 AI Agent가 수행하므로 Spring은 조회만 사용한다.
 */
public interface AiCallSummaryRepository extends JpaRepository<AiCallSummary, Long> {

    /**
     * 통화 세션에 연결된 요약을 조회한다.
     *
     * @param callSessionId 통화 세션 식별자
     * @return 생성 상태와 무관하게 존재하는 요약 (없으면 empty)
     */
    Optional<AiCallSummary> findByCallSession_Id(Long callSessionId);
}
