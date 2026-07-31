package com.ssafy.backend.post.dto;

import com.ssafy.backend.post.domain.Post;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 공지 상세 정보를 전달한다.
 *
 * @param noticeId 공지 식별자
 * @param meetingId 대상 팬미팅 식별자이며 서비스 공지는 null
 * @param title 공지 제목
 * @param content 공지 본문
 * @param authorId 작성자 식별자
 * @param authorNickname 작성자 닉네임
 * @param thumbnailUrl 썸네일 URL이며 첨부파일(ATTACH-001) 구현 전까지 항상 null
 * @param attachments 첨부파일 목록이며 첨부파일 구현 전까지 항상 빈 배열
 * @param createdAt 작성 시각
 * @param updatedAt 최종 수정 시각
 * @param pinned 상단 고정 여부
 * @param canEdit 조회자의 수정 가능 여부
 * @param canDelete 조회자의 삭제 가능 여부
 */
public record NoticeDetailResponse(
        Long noticeId,
        Long meetingId,
        String title,
        String content,
        Long authorId,
        String authorNickname,
        String thumbnailUrl,
        List<NoticeAttachmentResponse> attachments,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        boolean pinned,
        boolean canEdit,
        boolean canDelete
) {
    /**
     * 공지 게시글과 조회자 권한을 상세 응답으로 변환한다.
     *
     * @param post 작성자를 함께 조회한 공지 게시글
     * @param canEdit 조회자의 수정 가능 여부
     * @param canDelete 조회자의 삭제 가능 여부
     * @return 공지 상세 응답
     */
    public static NoticeDetailResponse of(Post post, boolean canEdit, boolean canDelete) {
        return new NoticeDetailResponse(
                post.getId(),
                post.getMeeting() == null ? null : post.getMeeting().getId(),
                post.getTitle(),
                post.getContent(),
                post.getAuthor().getId(),
                post.getAuthor().getNickname(),
                // posts 테이블에 썸네일 컬럼이 없고 첨부파일이 아직 없으므로 항상 null이다.
                null,
                // 첨부파일 업로드(ATTACH-001)가 구현되기 전까지 첨부 목록은 항상 비어 있다.
                List.of(),
                post.getCreatedAt(),
                post.getUpdatedAt(),
                post.isPinned(),
                canEdit,
                canDelete
        );
    }
}
