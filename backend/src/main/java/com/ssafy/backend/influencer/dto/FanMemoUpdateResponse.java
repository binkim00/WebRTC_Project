package com.ssafy.backend.influencer.dto;

import com.ssafy.backend.influencer.domain.FanMemo;
import com.ssafy.backend.meeting.domain.FanMeeting;

import java.time.LocalDateTime;

/**
 * 팬 메모 수정(MEMO-003a) 응답이다.
 *
 * @param memoId 수정된 메모 식별자
 * @param meetingId 메모가 속한 팬미팅 회차 식별자이며 회차와 무관한 메모는 null
 * @param content 수정된 메모 내용
 * @param createdAt 작성 시각
 * @param updatedAt 수정 시각
 */
public record FanMemoUpdateResponse(
        Long memoId,
        Long meetingId,
        String content,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {

    /**
     * 수정된 팬 메모 엔티티를 수정 응답으로 변환한다.
     *
     * @param memo 변환할 팬 메모
     * @return 수정 결과 응답
     */
    public static FanMemoUpdateResponse from(FanMemo memo) {
        FanMeeting meeting = memo.getMeeting();
        return new FanMemoUpdateResponse(
                memo.getId(),
                meeting == null ? null : meeting.getId(),
                memo.getContent(),
                memo.getCreatedAt(),
                memo.getUpdatedAt()
        );
    }
}
