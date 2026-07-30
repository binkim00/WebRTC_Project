package com.ssafy.backend.influencer.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 팬 메모 수정 요청이다.
 *
 * @param content 새로운 메모 내용
 */
public record FanMemoUpdateRequest(
        @NotBlank String content
) {
}
