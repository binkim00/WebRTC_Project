package com.ssafy.backend.ai.dto;

import java.util.List;

/**
 * 팬이 기념 카드 문구를 고를 때 필요한 후보 전체를 전달한다.
 *
 * <p>AI 추천이 늦거나 실패해도 팬이 자막에서 직접 고를 수 있어야 하므로, 생성 중이라고 응답을
 * 미루지 않고 {@code suggestionStatus}로 상태만 알린다. 클라이언트는 이 상태가
 * {@link FanCardSuggestionStatus#GENERATING}일 때만 다시 조회하면 된다.
 *
 * @param callSessionId 카드를 만들 통화 세션 식별자
 * @param suggestionStatus AI 추천 문구의 준비 상태
 * @param aiSuggestions AI가 인플루언서 발화에서 골라 준 추천 문구이며 준비되지 않았으면 빈 목록
 * @param influencerQuotes 팬이 직접 고를 수 있는 인플루언서 발화 목록
 * @param savedCard 이미 저장한 카드이며 아직 고르지 않았으면 {@code null}
 */
public record FanCardCandidatesResponse(
        Long callSessionId,
        FanCardSuggestionStatus suggestionStatus,
        List<String> aiSuggestions,
        List<InfluencerQuoteResponse> influencerQuotes,
        FanCardResponse savedCard
) {

    /**
     * 카드 문구 후보 응답을 만든다.
     *
     * @param callSessionId 통화 세션 식별자
     * @param suggestionStatus AI 추천 문구의 준비 상태
     * @param aiSuggestions AI 추천 문구 목록
     * @param influencerQuotes 인플루언서 발화 목록
     * @param savedCard 이미 저장한 카드이며 없으면 {@code null}
     * @return 카드 문구 후보 응답
     */
    public static FanCardCandidatesResponse of(
            Long callSessionId,
            FanCardSuggestionStatus suggestionStatus,
            List<String> aiSuggestions,
            List<InfluencerQuoteResponse> influencerQuotes,
            FanCardResponse savedCard
    ) {
        return new FanCardCandidatesResponse(
                callSessionId,
                suggestionStatus,
                List.copyOf(aiSuggestions),
                List.copyOf(influencerQuotes),
                savedCard
        );
    }
}
