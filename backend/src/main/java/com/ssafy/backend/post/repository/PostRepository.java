package com.ssafy.backend.post.repository;

import com.ssafy.backend.post.domain.Post;
import com.ssafy.backend.post.domain.PostStatus;
import com.ssafy.backend.post.domain.PostType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

/**
 * 통합 게시글 영속성 처리를 담당한다.
 */
public interface PostRepository extends JpaRepository<Post, Long> {

    /**
     * 서비스 공지 목록을 작성자와 함께 한 번에 조회한다.
     *
     * <p>작성자를 fetch join해 목록 매핑 중 작성자별 추가 조회가 발생하지 않도록 한다.
     * 검색어를 사용하지 않을 때는 모든 행과 일치하는 {@code %} 패턴을 넘겨
     * 파라미터가 null인 비교식을 만들지 않는다.
     *
     * @param type 조회할 공지 유형
     * @param status 노출 대상 공개 상태
     * @param keyword 소문자로 변환한 제목·본문 LIKE 패턴이며 전체 조회는 {@code %}
     * @param pageable 정렬과 페이지 정보
     * @return 삭제되지 않은 서비스 공지 페이지
     */
    @Query(value = """
            select p from Post p
            join fetch p.author
            where p.type = :type
              and p.meeting is null
              and p.status = :status
              and p.deletedAt is null
              and (lower(p.title) like :keyword or lower(p.content) like :keyword)
            """,
            countQuery = """
            select count(p) from Post p
            where p.type = :type
              and p.meeting is null
              and p.status = :status
              and p.deletedAt is null
              and (lower(p.title) like :keyword or lower(p.content) like :keyword)
            """)
    Page<Post> findVisibleServiceNotices(@Param("type") PostType type,
                                         @Param("status") PostStatus status,
                                         @Param("keyword") String keyword,
                                         Pageable pageable);

    /**
     * 특정 팬미팅의 공지 목록을 작성자·팬미팅과 함께 한 번에 조회한다.
     *
     * @param type 조회할 공지 유형
     * @param meetingId 대상 팬미팅 식별자
     * @param status 노출 대상 공개 상태
     * @param keyword 소문자로 변환한 제목·본문 LIKE 패턴이며 전체 조회는 {@code %}
     * @param pageable 정렬과 페이지 정보
     * @return 삭제되지 않은 해당 팬미팅의 공지 페이지
     */
    @Query(value = """
            select p from Post p
            join fetch p.author
            join fetch p.meeting m
            where p.type = :type
              and m.id = :meetingId
              and p.status = :status
              and p.deletedAt is null
              and (lower(p.title) like :keyword or lower(p.content) like :keyword)
            """,
            countQuery = """
            select count(p) from Post p
            where p.type = :type
              and p.meeting.id = :meetingId
              and p.status = :status
              and p.deletedAt is null
              and (lower(p.title) like :keyword or lower(p.content) like :keyword)
            """)
    Page<Post> findVisibleMeetingNotices(@Param("type") PostType type,
                                         @Param("meetingId") Long meetingId,
                                         @Param("status") PostStatus status,
                                         @Param("keyword") String keyword,
                                         Pageable pageable);

    /**
     * 상세 조회용 게시글을 작성자·팬미팅과 함께 조회한다.
     *
     * <p>유형·팬미팅·공개 상태 검증은 서비스가 수행하므로 여기서는 필터를 적용하지 않는다.
     *
     * @param postId 게시글 식별자
     * @return 게시글이며 없으면 빈 값
     */
    @Query("""
            select p from Post p
            join fetch p.author
            left join fetch p.meeting
            where p.id = :postId
            """)
    Optional<Post> findDetailById(@Param("postId") Long postId);
}
