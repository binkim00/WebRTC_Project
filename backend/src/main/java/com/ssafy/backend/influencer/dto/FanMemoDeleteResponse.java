package com.ssafy.backend.influencer.dto;

import com.ssafy.backend.influencer.domain.FanMemo;

import java.time.LocalDateTime;

/**
 * 팬 메모 삭제(MEMO-003b) 응답이다.
 * 실제 행을 지우지 않는 소프트 삭제이므로 삭제 처리 시각을 함께 반환한다.
 *
 * @param memoId 삭제된 메모 식별자
 * @param deleted 삭제 처리 여부
 * @param deletedAt 삭제 처리 시각
 */
public record FanMemoDeleteResponse(
        Long memoId,
        boolean deleted,
        LocalDateTime deletedAt
) {

    /**
     * 소프트 삭제된 팬 메모 엔티티를 삭제 응답으로 변환한다.
     *
     * @param memo 변환할 팬 메모
     * @return 삭제 결과 응답
     */
    public static FanMemoDeleteResponse from(FanMemo memo) {
        return new FanMemoDeleteResponse(memo.getId(), true, memo.getDeletedAt());
    }
}
