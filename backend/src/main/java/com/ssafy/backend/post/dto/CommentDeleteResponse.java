package com.ssafy.backend.post.dto;

import com.ssafy.backend.post.domain.PostComment;

import java.time.LocalDateTime;

/**
 * 댓글 삭제 결과를 전달한다.
 *
 * <p>실제 행을 지우지 않으므로 처리 결과를 상태 값으로 함께 알린다.
 * 작성자 본인이 삭제하면 {@code deletedAt}이 기록되고, 작성자가 아닌 운영자가
 * 내리면 상태만 {@code HIDDEN}으로 바뀌고 {@code deletedAt}은 null로 남는다.
 *
 * @param commentId 삭제 처리한 댓글 식별자
 * @param postId 댓글이 달린 게시글 식별자
 * @param status 처리 후 댓글 상태
 * @param deletedAt 논리 삭제 시각이며 숨김 처리한 경우 null
 */
public record CommentDeleteResponse(
        Long commentId,
        Long postId,
        String status,
        LocalDateTime deletedAt
) {
    /**
     * 삭제 처리한 댓글을 삭제 응답으로 변환한다.
     *
     * @param comment 삭제 또는 숨김 처리한 댓글
     * @return 댓글 삭제 응답
     */
    public static CommentDeleteResponse from(PostComment comment) {
        return new CommentDeleteResponse(
                comment.getId(),
                comment.getPost().getId(),
                comment.getStatus(),
                comment.getDeletedAt()
        );
    }
}
