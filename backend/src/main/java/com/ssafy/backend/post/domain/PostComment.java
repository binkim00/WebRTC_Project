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
     * 노출 가능한 댓글의 본문을 수정한다.
     *
     * <p>삭제·숨김 댓글은 존재하지 않는 것으로 취급해야 하므로 수정을 거부한다.
     *
     * @param content 새 댓글 본문
     * @throws IllegalStateException 이미 삭제되었거나 숨김 상태인 경우
     */
    public void update(String content) {
        if (!isVisibleToPublic()) {
            throw new IllegalStateException("노출 가능한 댓글만 수정할 수 있습니다.");
        }
        this.content = Objects.requireNonNull(content);
    }

    /**
     * 작성자 요청으로 댓글을 논리 삭제한다.
     *
     * <p>실제 행을 지우지 않고 삭제 시각만 기록해 목록 조회에서 제외한다.
     *
     * @param deletedAt 삭제 시각
     * @throws IllegalStateException 이미 삭제된 경우
     */
    public void softDelete(LocalDateTime deletedAt) {
        if (this.deletedAt != null) {
            throw new IllegalStateException("이미 삭제된 댓글입니다.");
        }
        this.deletedAt = Objects.requireNonNull(deletedAt);
    }

    /**
     * 운영자 요청으로 댓글을 숨김 처리한다.
     *
     * <p>작성자가 아닌 운영자가 댓글을 내리는 경우이며 신고 처리와 같은 상태 값을 사용한다.
     *
     * @throws IllegalStateException 이미 삭제되었거나 이미 숨김 상태인 경우
     */
    public void hide() {
        if (deletedAt != null) {
            throw new IllegalStateException("이미 삭제된 댓글입니다.");
        }
        if (STATUS_HIDDEN.equals(status)) {
            throw new IllegalStateException("이미 숨김 처리된 댓글입니다.");
        }
        this.status = STATUS_HIDDEN;
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
