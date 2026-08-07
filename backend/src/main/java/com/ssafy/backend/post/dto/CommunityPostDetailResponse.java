package com.ssafy.backend.post.dto;

import com.ssafy.backend.post.domain.Attachment;
import com.ssafy.backend.post.domain.Post;
import com.ssafy.backend.post.support.AttachmentUrls;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 커뮤니티 게시글 상세 정보를 전달한다.
 *
 * @param postId 게시글 식별자
 * @param meetingId 대상 팬미팅 식별자
 * @param title 게시글 제목
 * @param content 게시글 본문
 * @param authorId 작성자 식별자
 * @param authorNickname 작성자 닉네임
 * @param thumbnailUrl 첨부한 이미지 중 표시 순서가 가장 앞선 것의 URL이며 이미지가 없으면 null
 * @param attachments 표시 순서대로 정렬한 첨부파일 목록
 * @param commentCount 삭제·숨김되지 않은 댓글 수
 * @param createdAt 작성 시각
 * @param updatedAt 최종 수정 시각
 * @param pinned 상단 고정 여부
 * @param canEdit 조회자의 수정 가능 여부이며 작성자 본인만 true
 * @param canDelete 조회자의 삭제 가능 여부이며 작성자 본인이나 소유 운영자면 true
 */
public record CommunityPostDetailResponse(
        Long postId,
        Long meetingId,
        String title,
        String content,
        Long authorId,
        String authorNickname,
        String thumbnailUrl,
        List<NoticeAttachmentResponse> attachments,
        long commentCount,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        boolean pinned,
        boolean canEdit,
        boolean canDelete
) {
    /**
     * 커뮤니티 게시글과 첨부파일, 조회자 권한을 상세 응답으로 변환한다.
     *
     * @param post 작성자·팬미팅을 함께 조회한 커뮤니티 게시글
     * @param attachments 게시글에 연결된 첨부파일이며 표시 순서대로 정렬되어 있어야 한다
     * @param commentCount 노출 가능한 댓글 수
     * @param canEdit 조회자의 수정 가능 여부
     * @param canDelete 조회자의 삭제 가능 여부
     * @return 커뮤니티 게시글 상세 응답
     */
    public static CommunityPostDetailResponse of(Post post, List<Attachment> attachments,
                                                 long commentCount,
                                                 boolean canEdit, boolean canDelete) {
        return new CommunityPostDetailResponse(
                post.getId(),
                post.getMeeting() == null ? null : post.getMeeting().getId(),
                post.getTitle(),
                post.getContent(),
                post.getAuthor().getId(),
                post.getAuthor().getNickname(),
                // posts 테이블에 썸네일 컬럼이 없으므로 첨부 이미지를 대표로 승격한다.
                AttachmentUrls.thumbnailUrl(attachments),
                attachments.stream().map(NoticeAttachmentResponse::from).toList(),
                commentCount,
                post.getCreatedAt(),
                post.getUpdatedAt(),
                post.isPinned(),
                canEdit,
                canDelete
        );
    }
}
