package com.ssafy.backend.post.domain;

import com.ssafy.backend.common.entity.BaseTimeEntity;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.user.domain.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
 * 서비스 공지, 팬미팅 공지와 자유게시판 글을 통합 저장하는 엔티티다.
 */
@Getter
@Entity
@Table(name = "posts")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Post extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "post_id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "author_user_id", nullable = false)
    private User author;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "meeting_id")
    private FanMeeting meeting;

    @Enumerated(EnumType.STRING)
    @Column(name = "post_type", nullable = false, length = 30)
    private PostType type;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private PostStatus status;

    @Column(name = "is_pinned", nullable = false)
    private boolean pinned;

    @Column(name = "view_count", nullable = false)
    private Long viewCount;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    /**
     * 공지 게시글을 즉시 공개 상태로 초기화한다.
     *
     * @param author 작성자
     * @param meeting 팬미팅 공지의 대상 팬미팅이며 서비스 공지는 null
     * @param type 공지 유형
     * @param title 공지 제목
     * @param content 공지 본문
     */
    private Post(User author, FanMeeting meeting, PostType type, String title, String content) {
        this.author = Objects.requireNonNull(author);
        this.meeting = meeting;
        this.type = type;
        this.title = Objects.requireNonNull(title);
        this.content = Objects.requireNonNull(content);
        // 별도의 공개 API가 없으므로 작성 즉시 공개 상태로 저장한다.
        this.status = PostStatus.PUBLISHED;
        this.pinned = false;
        this.viewCount = 0L;
        this.deletedAt = null;
    }

    /**
     * 유형과 팬미팅 조합을 검증한 뒤 공개 상태의 공지를 생성한다.
     *
     * <p>서비스 공지는 {@code meeting_id}가 NULL이고 팬미팅 공지는 대상 팬미팅을 반드시 가진다.
     * 게시글 유형은 요청 경로가 고정하므로 클라이언트 값을 받지 않는다.
     *
     * @param author 작성자
     * @param meeting 팬미팅 공지의 대상 팬미팅이며 서비스 공지는 null
     * @param type 공지 유형이며 {@link PostType#SERVICE_NOTICE} 또는 {@link PostType#MEETING_NOTICE}
     * @param title 공지 제목
     * @param content 공지 본문
     * @return 공개 상태로 초기화된 공지 게시글
     * @throws IllegalArgumentException 공지 유형이 아니거나 유형과 팬미팅 조합이 맞지 않는 경우
     */
    public static Post createNotice(User author, FanMeeting meeting, PostType type,
                                    String title, String content) {
        if (type == PostType.SERVICE_NOTICE && meeting != null) {
            throw new IllegalArgumentException("서비스 공지는 팬미팅을 가질 수 없습니다.");
        }
        if (type == PostType.MEETING_NOTICE && meeting == null) {
            throw new IllegalArgumentException("팬미팅 공지는 대상 팬미팅이 필요합니다.");
        }
        if (type != PostType.SERVICE_NOTICE && type != PostType.MEETING_NOTICE) {
            throw new IllegalArgumentException("공지 유형만 생성할 수 있습니다.");
        }
        return new Post(author, meeting, type, title, content);
    }

    /**
     * 팬미팅에 연결된 커뮤니티 게시글을 공개 상태로 생성한다.
     *
     * <p>커뮤니티 게시글은 요청 경로의 팬미팅에 반드시 연결되므로 대상 팬미팅이 필요하다.
     * 게시글 유형은 요청 경로가 고정하므로 클라이언트 값을 받지 않는다.
     *
     * @param author 작성자
     * @param meeting 게시글을 연결할 팬미팅
     * @param title 게시글 제목
     * @param content 게시글 본문
     * @return 공개 상태로 초기화된 커뮤니티 게시글
     * @throws IllegalArgumentException 대상 팬미팅이 없는 경우
     */
    public static Post createCommunity(User author, FanMeeting meeting,
                                       String title, String content) {
        if (meeting == null) {
            throw new IllegalArgumentException("커뮤니티 게시글은 대상 팬미팅이 필요합니다.");
        }
        return new Post(author, meeting, PostType.COMMUNITY, title, content);
    }

    /**
     * 노출 가능한 게시글의 제목과 본문을 수정한다.
     *
     * <p>부분 수정을 지원하므로 null인 항목은 기존 값을 유지한다.
     * 삭제·숨김 상태의 게시글은 존재하지 않는 것으로 취급해야 하므로 수정을 거부한다.
     *
     * @param title 새 제목이며 유지하려면 null
     * @param content 새 본문이며 유지하려면 null
     * @throws IllegalStateException 이미 삭제되었거나 공개 상태가 아닌 경우
     */
    public void update(String title, String content) {
        if (!isVisibleToPublic()) {
            throw new IllegalStateException("노출 가능한 게시글만 수정할 수 있습니다.");
        }
        if (title != null) {
            this.title = title;
        }
        if (content != null) {
            this.content = content;
        }
    }

    /**
     * 작성자 요청으로 게시글을 논리 삭제한다.
     *
     * <p>실제 행을 지우지 않고 삭제 시각만 기록해 목록·상세 조회에서 제외한다.
     *
     * @param deletedAt 삭제 시각
     * @throws IllegalStateException 이미 삭제된 경우
     */
    public void softDelete(LocalDateTime deletedAt) {
        if (this.deletedAt != null) {
            throw new IllegalStateException("이미 삭제된 게시글입니다.");
        }
        this.deletedAt = Objects.requireNonNull(deletedAt);
    }

    /**
     * 운영자 요청으로 게시글을 숨김 처리한다.
     *
     * <p>작성자가 아닌 운영자가 글을 내리는 경우이며 행을 지우지 않고 상태만 바꾼다.
     *
     * @throws IllegalStateException 이미 삭제되었거나 이미 숨김 상태인 경우
     */
    public void hide() {
        if (deletedAt != null) {
            throw new IllegalStateException("이미 삭제된 게시글입니다.");
        }
        if (status == PostStatus.HIDDEN) {
            throw new IllegalStateException("이미 숨김 처리된 게시글입니다.");
        }
        this.status = PostStatus.HIDDEN;
    }

    /**
     * 일반 사용자에게 노출할 수 있는 게시글인지 확인한다.
     *
     * @return 삭제되지 않았고 공개 상태이면 true
     */
    public boolean isVisibleToPublic() {
        return deletedAt == null && status == PostStatus.PUBLISHED;
    }
}
