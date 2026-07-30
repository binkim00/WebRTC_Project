package com.ssafy.backend.influencer.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 팬 메모 작성 요청이다.
 * 회차와 연결되지 않은 일반 메모도 허용하므로 회차 식별자는 선택값이다.
 *
 * @param meetingId 메모가 속한 팬미팅 회차 식별자이며 회차와 무관한 메모는 생략한다
 * @param content 메모 내용
 */
public record FanMemoCreateRequest(
        Long meetingId,
        @NotBlank @Size(max = FanMemoContentPolicy.MAX_LENGTH) String content
) {
}
