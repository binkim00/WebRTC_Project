package com.ssafy.backend.influencer.dto;

import com.ssafy.backend.influencer.domain.FanMemo;
import com.ssafy.backend.meeting.domain.FanMeeting;

import java.time.LocalDateTime;

/**
 * 팬 메모 작성(MEMO-002) 응답이다.
 *
 * @param memoId 생성된 메모 식별자
 * @param fanId 메모 대상 팬의 식별자
 * @param meetingId 메모가 속한 팬미팅 회차 식별자이며 회차와 무관한 메모는 null
 * @param content 저장된 메모 내용
 * @param createdAt 작성 시각
 */
public record FanMemoCreateResponse(
        Long memoId,
        Long fanId,
        Long meetingId,
        String content,
        LocalDateTime createdAt
) {

    /**
     * 저장된 팬 메모 엔티티를 작성 응답으로 변환한다.
     *
     * @param memo 변환할 팬 메모
     * @return 작성 결과 응답
     */
    public static FanMemoCreateResponse from(FanMemo memo) {
        FanMeeting meeting = memo.getMeeting();
        return new FanMemoCreateResponse(
                memo.getId(),
                memo.getFan().getId(),
                meeting == null ? null : meeting.getId(),
                memo.getContent(),
                memo.getCreatedAt()
        );
    }
}
