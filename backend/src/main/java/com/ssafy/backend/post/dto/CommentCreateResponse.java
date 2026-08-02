package com.ssafy.backend.post.dto;

import com.ssafy.backend.post.domain.PostComment;

import java.time.LocalDateTime;

/**
 * 댓글 작성 결과를 전달한다.
 *
 * @param commentId 생성된 댓글 식별자
 * @param authorId 작성자 식별자
 * @param authorNickname 작성자 닉네임
 * @param content 댓글 본문
 * @param createdAt 작성 시각
 */
public record CommentCreateResponse(
        Long commentId,
        Long authorId,
        String authorNickname,
        String content,
        LocalDateTime createdAt
) {
    /**
     * 저장된 댓글을 작성 응답으로 변환한다.
     *
     * @param comment 작성자를 함께 가진 저장된 댓글
     * @return 댓글 작성 응답
     */
    public static CommentCreateResponse from(PostComment comment) {
        return new CommentCreateResponse(
                comment.getId(),
                comment.getAuthor().getId(),
                comment.getAuthor().getNickname(),
                comment.getContent(),
                comment.getCreatedAt()
        );
    }
}
