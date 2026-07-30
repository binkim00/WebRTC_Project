package com.ssafy.backend.influencer.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 팬 메모 수정 요청이다.
 *
 * @param content 새로운 메모 내용
 */
public record FanMemoUpdateRequest(
        @NotBlank @Size(max = FanMemoContentPolicy.MAX_LENGTH) String content
) {
}
