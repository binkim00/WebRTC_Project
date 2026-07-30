package com.ssafy.backend.post.dto;

import com.ssafy.backend.post.domain.Post;

import java.time.LocalDateTime;

/**
 * 공지 작성 결과를 전달한다.
 *
 * @param noticeId 생성된 공지 식별자
 * @param meetingId 대상 팬미팅 식별자이며 서비스 공지는 null
 * @param title 공지 제목
 * @param createdAt 작성 시각
 */
public record NoticeCreateResponse(
        Long noticeId,
        Long meetingId,
        String title,
        LocalDateTime createdAt
) {
    /**
     * 저장된 공지를 작성 응답으로 변환한다.
     *
     * @param post 저장된 공지 게시글
     * @return 공지 작성 응답
     */
    public static NoticeCreateResponse from(Post post) {
        return new NoticeCreateResponse(
                post.getId(),
                post.getMeeting() == null ? null : post.getMeeting().getId(),
                post.getTitle(),
                post.getCreatedAt()
        );
    }
}
