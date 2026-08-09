package com.ssafy.backend.post.support;

import com.ssafy.backend.post.domain.Attachment;

import java.util.List;

/**
 * 첨부파일 콘텐츠 조회 URL을 만든다.
 *
 * <p>첨부파일은 저장 경로를 그대로 노출하지 않고 권한을 검사하는 조회 엔드포인트로만 내려주므로,
 * 업로드 응답과 공지 상세 응답이 같은 규칙으로 URL을 만들도록 한곳에 모은다.
 */
public final class AttachmentUrls {

    /** 첨부파일 콘텐츠 조회 경로 형식이다. */
    private static final String CONTENT_PATH_FORMAT = "/api/v1/attachments/%d/content";

    /** 유틸리티 클래스이므로 인스턴스를 만들지 않는다. */
    private AttachmentUrls() {
    }

    /**
     * 첨부파일 콘텐츠 조회 URL을 만든다.
     *
     * @param attachmentId 첨부파일 식별자
     * @return 콘텐츠 조회 경로
     */
    public static String contentUrl(Long attachmentId) {
        return CONTENT_PATH_FORMAT.formatted(attachmentId);
    }

    /**
     * 게시글 목록·상세에 쓸 대표 썸네일 URL을 고른다.
     *
     * <p>{@code posts} 테이블에는 썸네일 컬럼이 없으므로 연결된 첨부 이미지를 대표로 승격한다.
     * 표시 순서가 가장 앞선 이미지를 쓰며, PDF만 붙어 있으면 그릴 그림이 없으므로 null이다.
     *
     * @param attachments 게시글에 연결된 첨부파일이며 표시 순서대로 정렬되어 있어야 한다
     * @return 대표 이미지의 콘텐츠 조회 URL이며 이미지 첨부가 없으면 null
     */
    public static String thumbnailUrl(List<Attachment> attachments) {
        return attachments.stream()
                .filter(Attachment::isImage)
                .findFirst()
                .map(attachment -> contentUrl(attachment.getId()))
                .orElse(null);
    }
}
