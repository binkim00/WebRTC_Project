package com.ssafy.backend.post.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 댓글 수정 요청 값을 전달한다.
 *
 * <p>댓글은 본문 하나만 가지므로 부분 수정이 없고 본문을 항상 받는다.
 * 최대 길이는 작성 요청과 같은 기준을 적용한다.
 *
 * @param content 새 댓글 본문
 */
public record CommentUpdateRequest(
        @NotBlank @Size(max = CommentUpdateRequest.CONTENT_MAX_LENGTH) String content
) {
    /**
     * post_comments.content(MySQL TEXT) 한도 안의 본문 최대 길이다.
     *
     * <p>{@link CommentCreateRequest#CONTENT_MAX_LENGTH}와 기준을 맞춘다.
     */
    public static final int CONTENT_MAX_LENGTH = 20_000;
}
