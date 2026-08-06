package com.ssafy.backend.ai.dto;

import com.ssafy.backend.ai.domain.FanCard;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 팬이 고른 기념 카드 문구 저장 요청이다.
 *
 * <p>문구는 AI 추천과 자막 직접 선택 어느 쪽에서도 올 수 있고, 팬이 손으로 다듬을 수도 있어
 * 서버는 출처를 구분하지 않고 길이만 검증한다.
 *
 * @param text 팬이 카드에 담을 문구
 */
public record FanCardSaveRequest(
        @NotBlank @Size(max = FanCard.MAX_TEXT_LENGTH) String text
) {
}
