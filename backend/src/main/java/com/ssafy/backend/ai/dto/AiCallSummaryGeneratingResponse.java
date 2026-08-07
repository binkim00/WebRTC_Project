package com.ssafy.backend.ai.dto;

import com.ssafy.backend.ai.domain.AiCallSummaryStatus;

/**
 * 요약이 아직 생성 중일 때 전달하는 안내 응답이다.
 *
 * @param status 생성 진행 상태
 * @param message 클라이언트에 보여줄 안내 문구
 */
public record AiCallSummaryGeneratingResponse(
        AiCallSummaryStatus status,
        String message
) {

    private static final String GENERATING_MESSAGE = "요약을 생성 중입니다";

    /**
     * 생성 중 상태를 알리는 응답을 만든다.
     *
     * @return 생성 중 안내 응답
     */
    public static AiCallSummaryGeneratingResponse generating() {
        return new AiCallSummaryGeneratingResponse(
                AiCallSummaryStatus.GENERATING, GENERATING_MESSAGE);
    }
}
