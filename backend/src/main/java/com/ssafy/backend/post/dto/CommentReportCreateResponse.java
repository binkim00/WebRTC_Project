package com.ssafy.backend.post.dto;

import com.ssafy.backend.post.domain.CommentReport;

import java.time.LocalDateTime;

/**
 * 댓글 신고 접수 결과를 전달한다.
 *
 * @param reportId 생성된 신고 식별자
 * @param commentId 신고 대상 댓글 식별자
 * @param reportStatus 신고 처리 상태이며 접수 직후에는 항상 {@code RECEIVED}
 * @param reportedAt 신고 접수 시각
 */
public record CommentReportCreateResponse(
        Long reportId,
        Long commentId,
        String reportStatus,
        LocalDateTime reportedAt
) {
    /**
     * 저장된 댓글 신고를 접수 응답으로 변환한다.
     *
     * @param report 신고 대상 댓글을 함께 가진 저장된 신고
     * @return 댓글 신고 접수 응답
     */
    public static CommentReportCreateResponse from(CommentReport report) {
        return new CommentReportCreateResponse(
                report.getId(),
                report.getComment().getId(),
                report.getStatus(),
                report.getReportedAt()
        );
    }
}
