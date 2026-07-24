package com.ssafy.backend.post.repository;

import com.ssafy.backend.post.domain.Post;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 통합 게시글 영속성 처리를 담당한다.
 */
public interface PostRepository extends JpaRepository<Post, Long> {
}
