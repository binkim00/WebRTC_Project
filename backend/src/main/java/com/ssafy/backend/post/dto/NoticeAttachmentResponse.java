package com.ssafy.backend.post.dto;

/**
 * 공지 상세의 첨부파일 한 건을 전달한다.
 *
 * <p>첨부파일 업로드(ATTACH-001)가 아직 구현되지 않아 상세 응답의 첨부 목록은 항상 비어 있다.
 * 응답 형태를 미리 고정해 두어 첨부파일이 구현될 때 필드 계약이 바뀌지 않게 한다.
 *
 * @param attachmentId 첨부파일 식별자
 * @param originalFileName 업로드 당시 원본 파일명
 * @param fileUrl 내려받기 URL
 * @param contentType 파일 MIME type
 * @param fileSize 파일 크기(byte)
 */
public record NoticeAttachmentResponse(
        Long attachmentId,
        String originalFileName,
        String fileUrl,
        String contentType,
        Long fileSize
) {
}
