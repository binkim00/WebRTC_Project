package com.ssafy.backend.post.dto;

import com.ssafy.backend.post.domain.Attachment;
import com.ssafy.backend.post.support.AttachmentUrls;

/**
 * 게시글 상세의 첨부파일 한 건을 전달한다.
 *
 * <p>공지와 커뮤니티 게시글이 같은 첨부 계약을 쓰므로 두 상세 응답이 이 타입을 함께 쓴다.
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
     * 게시글에 연결된 첨부파일 엔티티를 상세 응답 항목으로 변환한다.
     *
     * @param attachment 게시글에 연결된 첨부파일
     * @return 게시글 상세 첨부파일 항목
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
