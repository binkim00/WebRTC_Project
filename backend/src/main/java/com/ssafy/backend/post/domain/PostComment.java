package com.ssafy.backend.post.domain;

import com.ssafy.backend.common.entity.BaseTimeEntity;
import com.ssafy.backend.user.domain.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Objects;

/**
 * 자유게시판의 댓글과 한 단계 답글을 저장하는 엔티티다.
 */
@Getter
@Entity
@Table(name = "post_comments")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PostComment extends BaseTimeEntity {

    /** 작성 직후의 일반 공개 상태 값이다. */
    public static final String STATUS_ACTIVE = "ACTIVE";

    /** 운영자가 신고 댓글을 가린 숨김 상태 값이며 일반 목록에서 제외한다. */
    public static final String STATUS_HIDDEN = "HIDDEN";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "comment_id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "post_id", nullable = false)
    private Post post;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "author_user_id", nullable = false)
    private User author;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_comment_id")
    private PostComment parentComment;

    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "status", nullable = false, length = 30)
    private String status;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    /**
     * 게시글에 달리는 일반 댓글을 공개 상태로 초기화한다.
     *
     * <p>대댓글은 MVP 범위에서 제외되어 {@code parentComment}를 항상 null로 저장한다.
     * 확장을 위해 {@code parent_comment_id} 컬럼과 연관관계는 그대로 유지한다.
     *
     * @param post 댓글을 달 게시글
     * @param author 댓글 작성자
     * @param content 댓글 본문
     */
    private PostComment(Post post, User author, String content) {
        this.post = Objects.requireNonNull(post);
        this.author = Objects.requireNonNull(author);
        // 대댓글은 MVP 제외이므로 상위 댓글을 연결하지 않는다.
        this.parentComment = null;
        this.content = Objects.requireNonNull(content);
        this.status = STATUS_ACTIVE;
        this.deletedAt = null;
    }

    /**
     * 대댓글이 아닌 일반 댓글을 생성한다.
     *
     * <p>게시글 유형과 작성 자격 검증은 서비스가 담당하며 여기서는 필수 값만 확인한다.
     *
     * @param post 댓글을 달 게시글
     * @param author 댓글 작성자
     * @param content 댓글 본문
     * @return 공개 상태로 초기화된 댓글
     * @throws NullPointerException 게시글·작성자·본문 중 하나라도 null인 경우
     */
    public static PostComment createComment(Post post, User author, String content) {
        return new PostComment(post, author, content);
    }

    /**
     * 일반 사용자에게 노출할 수 있는 댓글인지 확인한다.
     *
     * @return 삭제되지 않았고 운영자가 숨기지 않았으면 true
     */
    public boolean isVisibleToPublic() {
        return deletedAt == null && !STATUS_HIDDEN.equals(status);
    }
}
