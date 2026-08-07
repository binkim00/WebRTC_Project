package com.ssafy.backend.ai.repository;

import com.ssafy.backend.ai.domain.AiSubtitle;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * AI 자막 영속성 처리를 담당한다.
 */
public interface AiSubtitleRepository extends JpaRepository<AiSubtitle, Long> {

    /**
     * 통화 세션에서 지정한 화자가 말한 자막을 발화 순서대로 조회한다.
     *
     * <p>팬이 기념 카드 문구를 고를 때 인플루언서 발화만 후보로 노출하기 위해 사용한다.
     * 자막을 저장하는 Agent가 {@code speakerRole}에 {@code INFLUENCER} 또는 {@code FAN}만 넣는다.
     *
     * @param callSessionId 통화 세션 식별자
     * @param speakerRole 조회할 화자 역할
     * @return 발화 시각 오름차순 자막 목록
     */
    List<AiSubtitle> findByCallSession_IdAndSpeakerRoleOrderBySpokenAtAsc(
            Long callSessionId, String speakerRole);
}
