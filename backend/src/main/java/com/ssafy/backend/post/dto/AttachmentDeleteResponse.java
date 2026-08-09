package com.ssafy.backend.post.dto;

import com.ssafy.backend.post.domain.Attachment;

import java.time.LocalDateTime;

/**
 * 첨부파일 삭제 결과를 전달한다(ATTACH-003).
 *
 * @param attachmentId 삭제한 첨부파일 식별자
 * @param deletedAt 삭제 시각
 */
public record AttachmentDeleteResponse(
        Long attachmentId,
        LocalDateTime deletedAt
) {

    /**
     * 삭제 처리된 첨부파일 엔티티를 삭제 응답으로 변환한다.
     *
     * @param attachment 삭제 시각이 기록된 첨부파일
     * @return 첨부파일 삭제 응답
     */
    public static AttachmentDeleteResponse from(Attachment attachment) {
        return new AttachmentDeleteResponse(attachment.getId(), attachment.getDeletedAt());
    }
}
