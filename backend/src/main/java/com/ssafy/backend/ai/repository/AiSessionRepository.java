package com.ssafy.backend.ai.repository;

import com.ssafy.backend.ai.domain.AiSession;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * AI 통역 세션 영속성 처리를 담당한다.
 */
public interface AiSessionRepository extends JpaRepository<AiSession, Long> {
}
