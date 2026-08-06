package com.ssafy.backend.post.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 공지와 커뮤니티 게시글의 부분 수정 요청 값을 전달한다.
 *
 * <p>PATCH 요청이므로 보내지 않은 항목은 기존 값을 유지한다. {@code attachmentIds}는 공지에만
 * 허용하며, 보내면 그 목록이 연결 상태 전체를 대신한다. 빈 배열을 보내면 모든 첨부가 해제된다.
 *
 * @param title 새 제목이며 유지하려면 null
 * @param content 새 본문이며 유지하려면 null
 * @param attachmentIds 연결할 첨부파일 식별자 전체 목록이며 유지하려면 null
 */
public record PostUpdateRequest(
        @Size(max = PostUpdateRequest.TITLE_MAX_LENGTH) String title,
        @Size(max = PostUpdateRequest.CONTENT_MAX_LENGTH) String content,
        @Size(max = PostUpdateRequest.ATTACHMENT_MAX_COUNT) List<Long> attachmentIds
) {
    /** posts.title 컬럼과 동일한 제목 최대 길이이며 작성 요청과 기준을 맞춘다. */
    public static final int TITLE_MAX_LENGTH = 200;

    /** posts.content(MySQL TEXT) 한도 안의 본문 최대 길이이며 작성 요청과 기준을 맞춘다. */
    public static final int CONTENT_MAX_LENGTH = 20_000;

    /** 공지 한 건에 연결할 수 있는 첨부파일 최대 개수이며 작성 요청과 기준을 맞춘다. */
    public static final int ATTACHMENT_MAX_COUNT = NoticeCreateRequest.ATTACHMENT_MAX_COUNT;

    /**
     * 수정할 항목이 하나라도 있는지 검증한다.
     *
     * <p>세 항목이 모두 없으면 바꿀 내용이 없으므로 잘못된 요청으로 처리한다. 첨부 목록만
     * 보내면 제목·본문은 그대로 두고 첨부 연결만 바꾼다.
     *
     * @return 제목, 본문, 첨부 목록 중 하나라도 있으면 true
     */
    @AssertTrue(message = "수정할 제목, 본문 또는 첨부파일이 필요합니다.")
    public boolean isAnyFieldPresent() {
        return title != null || content != null || attachmentIds != null;
    }

    /**
     * 보낸 항목이 공백만으로 채워지지 않았는지 검증한다.
     *
     * <p>제목과 본문은 저장 시 앞뒤 공백을 제거하므로 공백만 보내면 빈 값이 된다.
     *
     * @return 보낸 항목이 모두 공백이 아니면 true
     */
    @AssertTrue(message = "제목과 본문은 공백일 수 없습니다.")
    public boolean isProvidedFieldNotBlank() {
        return (title == null || !title.trim().isEmpty())
                && (content == null || !content.trim().isEmpty());
    }
}
