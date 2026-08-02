package com.ssafy.backend.post.dto;

import com.ssafy.backend.post.domain.Post;

import java.time.LocalDateTime;

/**
 * 공지 목록 한 건의 요약 정보를 전달한다.
 *
 * @param noticeId 공지 식별자
 * @param meetingId 대상 팬미팅 식별자이며 서비스 공지는 null
 * @param title 공지 제목
 * @param authorId 작성자 식별자
 * @param authorNickname 작성자 닉네임
 * @param thumbnailUrl 목록 썸네일 URL이며 첨부파일(ATTACH-001) 구현 전까지 항상 null
 * @param createdAt 작성 시각
 * @param pinned 상단 고정 여부
 */
public record NoticeSummaryResponse(
        Long noticeId,
        Long meetingId,
        String title,
        Long authorId,
        String authorNickname,
        String thumbnailUrl,
        LocalDateTime createdAt,
        boolean pinned
) {
    /**
     * 공지 게시글을 목록 요약 응답으로 변환한다.
     *
     * @param post 작성자를 함께 조회한 공지 게시글
     * @return 공지 목록 요약 응답
     */
    public static NoticeSummaryResponse from(Post post) {
        return new NoticeSummaryResponse(
                post.getId(),
                post.getMeeting() == null ? null : post.getMeeting().getId(),
                post.getTitle(),
                post.getAuthor().getId(),
                post.getAuthor().getNickname(),
                // posts 테이블에 썸네일 컬럼이 없고 첨부파일이 아직 없으므로 항상 null이다.
                null,
                post.getCreatedAt(),
                post.isPinned()
        );
    }
}
