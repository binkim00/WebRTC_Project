package com.ssafy.backend.post.dto;

import com.ssafy.backend.post.domain.Attachment;
import com.ssafy.backend.post.support.AttachmentUrls;

/**
 * 업로드된 공지 첨부파일 정보를 전달한다(ATTACH-001).
 *
 * @param attachmentId 첨부파일 식별자
 * @param originalFileName 업로드 당시 원본 파일명
 * @param fileUrl 첨부파일 콘텐츠 조회 URL
 * @param contentType 파일 MIME type
 * @param fileSize 파일 크기(byte)
 */
public record AttachmentUploadResponse(
        Long attachmentId,
        String originalFileName,
        String fileUrl,
        String contentType,
        Long fileSize
) {

    /**
     * 저장된 첨부파일 엔티티를 업로드 응답으로 변환한다.
     *
     * @param attachment 저장된 첨부파일
     * @return 업로드 응답
     */
    public static AttachmentUploadResponse from(Attachment attachment) {
        return new AttachmentUploadResponse(
                attachment.getId(),
                attachment.getOriginalFileName(),
                AttachmentUrls.contentUrl(attachment.getId()),
                attachment.getMimeType(),
                attachment.getFileSizeBytes()
        );
    }
}
