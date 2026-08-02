package com.ssafy.backend.post.dto;

import com.ssafy.backend.post.domain.Attachment;
import com.ssafy.backend.post.support.AttachmentUrls;

/**
 * 공지 상세의 첨부파일 한 건을 전달한다.
 *
 * @param attachmentId 첨부파일 식별자
 * @param originalFileName 업로드 당시 원본 파일명
 * @param fileUrl 첨부파일 콘텐츠 조회 URL
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

    /**
     * 공지에 연결된 첨부파일 엔티티를 상세 응답 항목으로 변환한다.
     *
     * @param attachment 공지에 연결된 첨부파일
     * @return 공지 상세 첨부파일 항목
     */
    public static NoticeAttachmentResponse from(Attachment attachment) {
        return new NoticeAttachmentResponse(
                attachment.getId(),
                attachment.getOriginalFileName(),
                AttachmentUrls.contentUrl(attachment.getId()),
                attachment.getMimeType(),
                attachment.getFileSizeBytes()
        );
    }
}
