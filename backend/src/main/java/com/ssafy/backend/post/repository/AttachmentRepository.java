package com.ssafy.backend.post.repository;

import com.ssafy.backend.post.domain.Attachment;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 게시글 첨부파일 영속성 처리를 담당한다.
 */
public interface AttachmentRepository extends JpaRepository<Attachment, Long> {
}
