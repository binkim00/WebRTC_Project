package com.ssafy.backend.post.repository;

import com.ssafy.backend.post.domain.PostComment;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 게시글 댓글 영속성 처리를 담당한다.
 */
public interface PostCommentRepository extends JpaRepository<PostComment, Long> {
}
