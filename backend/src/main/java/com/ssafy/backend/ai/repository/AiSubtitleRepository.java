package com.ssafy.backend.ai.repository;

import com.ssafy.backend.ai.domain.AiSubtitle;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * AI 자막 영속성 처리를 담당한다.
 */
public interface AiSubtitleRepository extends JpaRepository<AiSubtitle, Long> {
}
