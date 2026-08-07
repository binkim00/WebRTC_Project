package com.ssafy.backend.post.repository;

import com.ssafy.backend.post.domain.Attachment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

/**
 * 게시글 첨부파일 영속성 처리를 담당한다.
 */
public interface AttachmentRepository extends JpaRepository<Attachment, Long> {

    /**
     * 게시글에 연결된 삭제되지 않은 첨부파일을 표시 순서대로 조회한다.
     *
     * @param postId 게시글 식별자
     * @return 표시 순서 오름차순 첨부파일 목록
     */
    List<Attachment> findAllByPost_IdAndDeletedAtIsNullOrderByDisplayOrderAsc(Long postId);

    /**
     * 여러 게시글에 연결된 삭제되지 않은 첨부파일을 표시 순서대로 조회한다.
     *
     * <p>목록 조회에서 게시글마다 첨부를 따로 조회하지 않도록 한 번에 읽는다.
     *
     * @param postIds 게시글 식별자 목록
     * @return 표시 순서 오름차순 첨부파일 목록
     */
    List<Attachment> findAllByPost_IdInAndDeletedAtIsNullOrderByDisplayOrderAsc(
            Collection<Long> postIds);

    /**
     * 요청한 식별자 중 삭제되지 않은 첨부파일을 조회한다.
     *
     * <p>공지 작성·수정에서 받은 {@code attachmentIds}를 검증하기 위해 사용한다.
     *
     * @param attachmentIds 첨부파일 식별자 목록
     * @return 삭제되지 않은 첨부파일 목록
     */
    List<Attachment> findAllByIdInAndDeletedAtIsNull(Collection<Long> attachmentIds);

    /**
     * 첨부파일을 업로더와 연결 게시글까지 함께 조회한다.
     *
     * <p>콘텐츠 조회는 업로더 본인 여부와 연결된 공지의 공개 여부를 함께 판단하므로
     * 지연 로딩으로 추가 질의가 발생하지 않도록 한 번에 읽는다.
     *
     * @param attachmentId 첨부파일 식별자
     * @return 업로더와 게시글을 포함한 첨부파일
     */
    @Query("""
            select attachment
            from Attachment attachment
            join fetch attachment.uploader
            left join fetch attachment.post post
            left join fetch post.author
            where attachment.id = :attachmentId
            """)
    Optional<Attachment> findAccessContextById(@Param("attachmentId") Long attachmentId);
}
