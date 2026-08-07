package com.ssafy.backend.post.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 커뮤니티 게시글의 댓글 작성 요청 값을 전달한다.
 *
 * <p>대댓글은 MVP 범위에서 제외되어 상위 댓글 식별자를 받지 않는다.
 *
 * @param content 댓글 본문이며 post_comments.content(TEXT) 한도 안에서 허용한다
 */
public record CommentCreateRequest(
        @NotBlank @Size(max = CommentCreateRequest.CONTENT_MAX_LENGTH) String content
) {
    /**
     * post_comments.content(MySQL TEXT) 컬럼에 안전하게 저장할 수 있는 본문 최대 길이다.
     *
     * <p>TEXT는 65,535 byte까지 저장하며 UTF-8 한글은 글자당 3 byte를 쓰므로
     * 20,000자는 최대 60,000 byte로 컬럼 한도 안에 들어온다.
     * 같은 TEXT 컬럼을 쓰는 {@link NoticeCreateRequest#CONTENT_MAX_LENGTH}와 기준을 맞춘다.
     */
    public static final int CONTENT_MAX_LENGTH = 20_000;
}
