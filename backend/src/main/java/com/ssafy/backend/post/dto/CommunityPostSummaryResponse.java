package com.ssafy.backend.post.dto;

import com.ssafy.backend.post.domain.Attachment;
import com.ssafy.backend.post.domain.Post;
import com.ssafy.backend.post.support.AttachmentUrls;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 커뮤니티 게시글 목록 한 건의 요약 정보를 전달한다.
 *
 * <p>목록에서는 건별 댓글 수 집계가 N+1 질의를 만들므로 {@code commentCount}를 제공하지 않는다.
 * 댓글 수는 상세 조회({@link CommunityPostDetailResponse})에서 제공한다.
 *
 * @param postId 게시글 식별자
 * @param meetingId 대상 팬미팅 식별자
 * @param title 게시글 제목
 * @param authorId 작성자 식별자
 * @param authorNickname 작성자 닉네임
 * @param thumbnailUrl 첨부한 이미지 중 표시 순서가 가장 앞선 것의 URL이며 이미지가 없으면 null
 * @param createdAt 작성 시각
 * @param pinned 상단 고정 여부
 */
public record CommunityPostSummaryResponse(
        Long postId,
        Long meetingId,
        String title,
        Long authorId,
        String authorNickname,
        String thumbnailUrl,
        LocalDateTime createdAt,
        boolean pinned
) {
    /**
     * 커뮤니티 게시글과 연결된 첨부파일을 목록 요약 응답으로 변환한다.
     *
     * @param post 작성자·팬미팅을 함께 조회한 커뮤니티 게시글
     * @param attachments 게시글에 연결된 첨부파일이며 표시 순서대로 정렬되어 있어야 한다
     * @return 커뮤니티 게시글 목록 요약 응답
     */
    public static CommunityPostSummaryResponse of(Post post, List<Attachment> attachments) {
        return new CommunityPostSummaryResponse(
                post.getId(),
                post.getMeeting() == null ? null : post.getMeeting().getId(),
                post.getTitle(),
                post.getAuthor().getId(),
                post.getAuthor().getNickname(),
                // posts 테이블에 썸네일 컬럼이 없으므로 첨부 이미지를 대표로 승격한다.
                AttachmentUrls.thumbnailUrl(attachments),
                post.getCreatedAt(),
                post.isPinned()
        );
    }
}
