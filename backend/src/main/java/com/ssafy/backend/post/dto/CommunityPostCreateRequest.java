package com.ssafy.backend.post.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 커뮤니티 게시글 작성 요청 값을 전달한다.
 *
 * <p>게시글 유형과 대상 팬미팅은 요청 경로가 고정하므로 {@code postType}과
 * {@code meetingId}를 받지 않는다. 첨부파일(ATTACH-001)은 이번 범위에서 제외되어
 * {@code attachmentIds}도 받지 않는다.
 *
 * @param title 게시글 제목이며 posts.title 컬럼 길이와 같은 200자까지 허용한다
 * @param content 게시글 본문이며 posts.content(TEXT) 한도 안에서 허용한다
 */
public record CommunityPostCreateRequest(
        @NotBlank @Size(max = CommunityPostCreateRequest.TITLE_MAX_LENGTH) String title,
        @NotBlank @Size(max = CommunityPostCreateRequest.CONTENT_MAX_LENGTH) String content
) {
    /** posts.title 컬럼과 동일한 제목 최대 길이이며 공지와 기준을 맞춘다. */
    public static final int TITLE_MAX_LENGTH = 200;

    /**
     * posts.content(MySQL TEXT) 컬럼에 안전하게 저장할 수 있는 본문 최대 길이다.
     *
     * <p>같은 컬럼을 쓰는 {@link NoticeCreateRequest#CONTENT_MAX_LENGTH}와 기준을 맞춘다.
     */
    public static final int CONTENT_MAX_LENGTH = 20_000;
}
