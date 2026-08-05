package com.ssafy.backend.ai.dto;

import com.ssafy.backend.ai.domain.FanCard;

import java.time.LocalDateTime;

/**
 * 팬이 저장한 기념 카드를 전달한다.
 *
 * @param fanCardId 기념 카드 식별자
 * @param callSessionId 카드를 만든 통화 세션 식별자
 * @param text 팬이 고른 문구
 * @param createdAt 카드를 처음 저장한 시각
 */
public record FanCardResponse(
        Long fanCardId,
        Long callSessionId,
        String text,
        LocalDateTime createdAt
) {

    /**
     * 기념 카드 엔티티를 응답으로 변환한다.
     *
     * @param fanCard 저장된 기념 카드
     * @return 기념 카드 응답
     */
    public static FanCardResponse from(FanCard fanCard) {
        return new FanCardResponse(
                fanCard.getId(),
                fanCard.getCallSession().getId(),
                fanCard.getText(),
                fanCard.getCreatedAt()
        );
    }
}
