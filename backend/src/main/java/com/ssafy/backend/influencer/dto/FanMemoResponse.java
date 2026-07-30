
package com.ssafy.backend.influencer.dto;

import com.ssafy.backend.influencer.domain.FanMemo;

import java.time.LocalDateTime;

/**
 * 팬 메모 응답이다.
 *
 * @param memoId 메모 ID
 * @param meetingId 팬미팅 회차 ID
 * @param content 메모 내용
 * @param createdAt 작성 시각
 * @param updatedAt 최종 수정 시각
 */
public record FanMemoResponse(
        Long memoId,
        Long meetingId,
        String content,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
 
    /**
     * FanMemo 엔티티를 응답 DTO로 변환한다.
     *
     * @param memo 변환할 팬 메모 엔티티
     * @return 변환된 응답 DTO
     */
    public static FanMemoResponse from(FanMemo memo) {
        return new FanMemoResponse(
                memo.getId(),
                memo.getMeeting().getId(),
                memo.getContent(),
                memo.getCreatedAt(),
                memo.getUpdatedAt()
        );
    }
}