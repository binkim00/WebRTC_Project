package com.ssafy.backend.post.repository;

import com.ssafy.backend.post.domain.CommentReport;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 댓글 신고 영속성 처리를 담당한다.
 */
public interface CommentReportRepository extends JpaRepository<CommentReport, Long> {

    /**
     * 같은 사용자가 같은 댓글을 이미 신고했는지 확인한다.
     *
     * <p>{@code comment_reports}의 유니크 제약이 확정되지 않았으므로(D-ERD-3)
     * 애플리케이션 계층에서 중복 신고를 차단하기 위해 사용한다.
     *
     * @param commentId 신고 대상 댓글 식별자
     * @param reporterId 신고자 식별자
     * @return 이미 신고한 이력이 있으면 true
     */
    boolean existsByComment_IdAndReporter_Id(Long commentId, Long reporterId);
}
