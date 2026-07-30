package com.ssafy.backend.post.repository;

import com.ssafy.backend.post.domain.PostComment;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

/**
 * 게시글 댓글 영속성 처리를 담당한다.
 */
public interface PostCommentRepository extends JpaRepository<PostComment, Long> {

    /**
     * 게시글의 노출 가능한 댓글을 작성자와 함께 한 번에 페이지 조회한다.
     *
     * <p>작성자를 fetch join해 목록 매핑 중 작성자별 추가 조회가 발생하지 않도록 한다.
     * 숨김 상태 값은 호출자가 넘기므로 {@link #findVisibleByPost(Long, Pageable)}를 사용한다.
     *
     * @param postId 게시글 식별자
     * @param hiddenStatus 목록에서 제외할 숨김 상태 값
     * @param pageable 정렬과 페이지 정보
     * @return 삭제·숨김되지 않은 댓글 페이지
     */
    @Query(value = """
            select c from PostComment c
            join fetch c.author
            where c.post.id = :postId
              and c.deletedAt is null
              and c.status <> :hiddenStatus
            """,
            countQuery = """
            select count(c) from PostComment c
            where c.post.id = :postId
              and c.deletedAt is null
              and c.status <> :hiddenStatus
            """)
    Page<PostComment> findVisibleByPost(@Param("postId") Long postId,
                                        @Param("hiddenStatus") String hiddenStatus,
                                        Pageable pageable);

    /**
     * 숨김 상태 값을 고정해 게시글의 노출 가능한 댓글만 페이지 조회한다.
     *
     * @param postId 게시글 식별자
     * @param pageable 정렬과 페이지 정보
     * @return 삭제·숨김되지 않은 댓글 페이지
     */
    default Page<PostComment> findVisibleByPost(Long postId, Pageable pageable) {
        return findVisibleByPost(postId, PostComment.STATUS_HIDDEN, pageable);
    }

    /**
     * 신고 처리에 사용할 댓글을 작성자·게시글과 함께 조회한다.
     *
     * <p>삭제·숨김 여부 판단은 서비스가 수행하므로 여기서는 필터를 적용하지 않는다.
     *
     * @param commentId 댓글 식별자
     * @return 댓글이며 없으면 빈 값
     */
    @Query("""
            select c from PostComment c
            join fetch c.author
            join fetch c.post
            where c.id = :commentId
            """)
    Optional<PostComment> findDetailById(@Param("commentId") Long commentId);
}
