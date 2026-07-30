package com.ssafy.backend.post.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 팬미팅 공지 작성 요청 값을 전달한다.
 *
 * <p>게시글 유형은 요청 경로가 고정하므로 {@code postType}을 받지 않는다.
 * 첨부파일(ATTACH-001)은 이번 범위에서 제외되어 {@code attachmentIds}도 받지 않는다.
 *
 * @param title 공지 제목이며 posts.title 컬럼 길이와 같은 200자까지 허용한다
 * @param content 공지 본문이며 posts.content(TEXT, 65,535 byte) 한도 안에서 허용한다
 */
public record NoticeCreateRequest(
        @NotBlank @Size(max = NoticeCreateRequest.TITLE_MAX_LENGTH) String title,
        @NotBlank @Size(max = NoticeCreateRequest.CONTENT_MAX_LENGTH) String content
) {
    /** posts.title 컬럼과 동일한 제목 최대 길이다. */
    public static final int TITLE_MAX_LENGTH = 200;

    /**
     * posts.content(MySQL TEXT) 컬럼에 안전하게 저장할 수 있는 본문 최대 길이다.
     *
     * <p>TEXT는 65,535 byte까지 저장하며 UTF-8 한글은 글자당 3 byte를 쓰므로
     * 20,000자는 최대 60,000 byte로 컬럼 한도 안에 들어온다.
     */
    public static final int CONTENT_MAX_LENGTH = 20_000;
}
