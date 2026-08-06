package com.ssafy.backend.post.dto;

import com.ssafy.backend.post.domain.Post;

import java.time.LocalDateTime;

/**
 * 공지와 커뮤니티 게시글의 수정 결과를 전달한다.
 *
 * @param postId 수정된 게시글 식별자
 * @param meetingId 대상 팬미팅 식별자이며 서비스 공지는 null
 * @param title 수정 후 제목
 * @param content 수정 후 본문
 * @param updatedAt 최종 수정 시각
 */
public record PostUpdateResponse(
        Long postId,
        Long meetingId,
        String title,
        String content,
        LocalDateTime updatedAt
) {
    /**
     * 수정된 게시글을 수정 응답으로 변환한다.
     *
     * @param post 수정된 게시글
     * @return 게시글 수정 응답
     */
    public static PostUpdateResponse from(Post post) {
        return new PostUpdateResponse(
                post.getId(),
                post.getMeeting() == null ? null : post.getMeeting().getId(),
                post.getTitle(),
                post.getContent(),
                post.getUpdatedAt()
        );
    }
}
