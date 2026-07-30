package com.ssafy.backend.influencer.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 팬 메모 작성 요청이다.
 *
 * @param meetingId 메모가 속한 팬미팅 회차 ID
 * @param content 메모 내용
 */
public record FanMemoCreateRequest(
        @NotNull Long meetingId,
        @NotBlank String content
) {
}
