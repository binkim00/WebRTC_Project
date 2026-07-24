package com.ssafy.backend.ai.repository;

import com.ssafy.backend.ai.domain.AiCallSummary;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * AI 통화 요약 영속성 처리를 담당한다.
 */
public interface AiCallSummaryRepository extends JpaRepository<AiCallSummary, Long> {
}
