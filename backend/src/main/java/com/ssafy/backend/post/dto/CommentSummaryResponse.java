package com.ssafy.backend.post.dto;

import com.ssafy.backend.post.domain.PostComment;

import java.time.LocalDateTime;

/**
 * 댓글 목록 한 건의 정보를 전달한다.
 *
 * @param commentId 댓글 식별자
 * @param authorId 작성자 식별자
 * @param authorNickname 작성자 닉네임
 * @param content 댓글 본문
 * @param createdAt 작성 시각
 * @param updatedAt 최종 수정 시각
 * @param canEdit 조회자의 수정 가능 여부
 * @param canDelete 조회자의 삭제 가능 여부
 */
public record CommentSummaryResponse(
        Long commentId,
        Long authorId,
        String authorNickname,
        String content,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        boolean canEdit,
        boolean canDelete
) {
    /**
     * 댓글과 조회자 권한을 목록 응답으로 변환한다.
     *
     * @param comment 작성자를 함께 조회한 댓글
     * @param canEdit 조회자의 수정 가능 여부
     * @param canDelete 조회자의 삭제 가능 여부
     * @return 댓글 목록 응답
     */
    public static CommentSummaryResponse of(PostComment comment, boolean canEdit, boolean canDelete) {
        return new CommentSummaryResponse(
                comment.getId(),
                comment.getAuthor().getId(),
                comment.getAuthor().getNickname(),
                comment.getContent(),
                comment.getCreatedAt(),
                comment.getUpdatedAt(),
                canEdit,
                canDelete
        );
    }
}
