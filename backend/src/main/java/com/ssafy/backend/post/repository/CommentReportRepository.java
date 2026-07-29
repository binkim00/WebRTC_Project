package com.ssafy.backend.post.repository;

import com.ssafy.backend.post.domain.CommentReport;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 댓글 신고 영속성 처리를 담당한다.
 */
public interface CommentReportRepository extends JpaRepository<CommentReport, Long> {
}
