package com.ssafy.backend.post.dto;

import com.ssafy.backend.post.domain.Post;

import java.time.LocalDateTime;

/**
 * 커뮤니티 게시글 작성 결과를 전달한다.
 *
 * @param postId 생성된 게시글 식별자
 * @param meetingId 대상 팬미팅 식별자
 * @param title 게시글 제목
 * @param createdAt 작성 시각
 */
public record CommunityPostCreateResponse(
        Long postId,
        Long meetingId,
        String title,
        LocalDateTime createdAt
) {
    /**
     * 저장된 커뮤니티 게시글을 작성 응답으로 변환한다.
     *
     * @param post 저장된 커뮤니티 게시글
     * @return 커뮤니티 게시글 작성 응답
     */
    public static CommunityPostCreateResponse from(Post post) {
        return new CommunityPostCreateResponse(
                post.getId(),
                post.getMeeting() == null ? null : post.getMeeting().getId(),
                post.getTitle(),
                post.getCreatedAt()
        );
    }
}
