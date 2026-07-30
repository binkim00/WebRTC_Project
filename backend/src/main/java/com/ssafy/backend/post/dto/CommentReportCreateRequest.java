package com.ssafy.backend.post.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 댓글 신고 요청 값을 전달한다.
 *
 * @param reason 신고 사유이며 comment_reports.reason 컬럼 길이와 같은 100자까지 허용한다
 * @param detail 상세 설명이며 선택 값이다
 */
public record CommentReportCreateRequest(
        @NotBlank @Size(max = CommentReportCreateRequest.REASON_MAX_LENGTH) String reason,
        @Size(max = CommentReportCreateRequest.DETAIL_MAX_LENGTH) String detail
) {
    /** comment_reports.reason 컬럼과 동일한 신고 사유 최대 길이다. */
    public static final int REASON_MAX_LENGTH = 100;

    /**
     * comment_reports.detail(MySQL TEXT) 컬럼에 안전하게 저장할 수 있는 상세 설명 최대 길이다.
     *
     * <p>TEXT는 65,535 byte까지 저장하며 UTF-8 한글은 글자당 3 byte를 쓰므로
     * 20,000자는 최대 60,000 byte로 컬럼 한도 안에 들어온다.
     */
    public static final int DETAIL_MAX_LENGTH = 20_000;
}
