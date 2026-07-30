package com.ssafy.backend.influencer.dto;

import com.ssafy.backend.influencer.domain.FanMemo;
import com.ssafy.backend.meeting.domain.FanMeeting;

import java.time.LocalDateTime;

/**
 * 팬 메모 목록 조회(MEMO-001) 응답 항목이다.
 *
 * @param memoId 메모 식별자
 * @param meetingId 메모가 속한 팬미팅 회차 식별자이며 회차와 무관한 메모는 null
 * @param meetingTitle 팬미팅 회차 제목이며 회차와 무관한 메모는 null
 * @param content 메모 내용
 * @param createdAt 작성 시각
 * @param updatedAt 최종 수정 시각
 */
public record FanMemoListResponse(
        Long memoId,
        Long meetingId,
        String meetingTitle,
        String content,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {

    /**
     * 팬 메모 엔티티를 목록 응답 항목으로 변환한다.
     *
     * @param memo 변환할 팬 메모
     * @return 회차 정보를 포함한 목록 응답 항목
     */
    public static FanMemoListResponse from(FanMemo memo) {
        FanMeeting meeting = memo.getMeeting();
        return new FanMemoListResponse(
                memo.getId(),
                meeting == null ? null : meeting.getId(),
                meeting == null ? null : meeting.getTitle(),
                memo.getContent(),
                memo.getCreatedAt(),
                memo.getUpdatedAt()
        );
    }
}
