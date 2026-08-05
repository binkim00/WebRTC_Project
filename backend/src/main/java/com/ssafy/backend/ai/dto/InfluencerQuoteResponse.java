package com.ssafy.backend.ai.dto;

import com.ssafy.backend.ai.domain.AiSubtitle;

import java.time.LocalDateTime;

/**
 * 팬이 기념 카드 문구로 고를 수 있는 인플루언서 발화 한 건이다.
 *
 * <p>원문과 번역문을 함께 내려 팬이 어느 쪽을 카드에 담을지 고를 수 있게 한다.
 * 해외 팬은 번역문을 읽지만 인플루언서가 실제로 한 말은 원문이라 둘 다 의미가 있다.
 *
 * @param subtitleId 자막 식별자이며 목록에서 선택 항목을 구분하는 데 사용한다
 * @param text 인플루언서가 실제로 말한 원문
 * @param translatedText 팬 언어로 번역된 문장이며 번역이 없으면 {@code null}
 * @param spokenAt 발화 시각
 */
public record InfluencerQuoteResponse(
        Long subtitleId,
        String text,
        String translatedText,
        LocalDateTime spokenAt
) {

    /**
     * 자막 엔티티를 카드 문구 후보 응답으로 변환한다.
     *
     * @param subtitle 인플루언서가 말한 자막
     * @return 카드 문구 후보 응답
     */
    public static InfluencerQuoteResponse from(AiSubtitle subtitle) {
        return new InfluencerQuoteResponse(
                subtitle.getId(),
                subtitle.getOriginalText(),
                subtitle.getTranslatedText(),
                subtitle.getSpokenAt()
        );
    }
}
