package com.ssafy.backend.post.dto;

import com.ssafy.backend.post.domain.Post;

import java.time.LocalDateTime;

/**
 * 공지와 커뮤니티 게시글의 삭제 결과를 전달한다.
 *
 * <p>실제 행을 지우지 않으므로 처리 결과를 상태 값으로 함께 알린다.
 * 작성자 본인이 삭제하면 {@code deletedAt}이 기록되고, 작성자가 아닌 운영자가
 * 내리면 상태만 {@code HIDDEN}으로 바뀌고 {@code deletedAt}은 null로 남는다.
 *
 * @param postId 삭제 처리한 게시글 식별자
 * @param status 처리 후 게시글 상태
 * @param deletedAt 논리 삭제 시각이며 숨김 처리한 경우 null
 */
public record PostDeleteResponse(
        Long postId,
        String status,
        LocalDateTime deletedAt
) {
    /**
     * 삭제 처리한 게시글을 삭제 응답으로 변환한다.
     *
     * @param post 삭제 또는 숨김 처리한 게시글
     * @return 게시글 삭제 응답
     */
    public static PostDeleteResponse from(Post post) {
        return new PostDeleteResponse(
                post.getId(),
                post.getStatus().name(),
                post.getDeletedAt()
        );
    }
}
