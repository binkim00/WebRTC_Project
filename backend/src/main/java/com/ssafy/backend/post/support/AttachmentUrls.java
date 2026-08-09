package com.ssafy.backend.post.support;

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
}
