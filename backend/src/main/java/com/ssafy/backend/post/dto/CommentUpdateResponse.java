package com.ssafy.backend.post.dto;

import com.ssafy.backend.post.domain.PostComment;

import java.time.LocalDateTime;

/**
 * 댓글 수정 결과를 전달한다.
 *
 * @param commentId 수정된 댓글 식별자
 * @param postId 댓글이 달린 게시글 식별자
 * @param content 수정 후 댓글 본문
 * @param updatedAt 최종 수정 시각
 */
public record CommentUpdateResponse(
        Long commentId,
        Long postId,
        String content,
        LocalDateTime updatedAt
) {
    /**
     * 수정된 댓글을 수정 응답으로 변환한다.
     *
     * @param comment 게시글을 함께 조회한 수정된 댓글
     * @return 댓글 수정 응답
     */
    public static CommentUpdateResponse from(PostComment comment) {
        return new CommentUpdateResponse(
                comment.getId(),
                comment.getPost().getId(),
                comment.getContent(),
                comment.getUpdatedAt()
        );
    }
}
