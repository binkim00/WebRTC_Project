package com.ssafy.backend.ai.repository;

import com.ssafy.backend.ai.domain.AiModeration;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * AI 위험 발언 감지 결과 영속성 처리를 담당한다.
 */
public interface AiModerationRepository extends JpaRepository<AiModeration, Long> {
}
