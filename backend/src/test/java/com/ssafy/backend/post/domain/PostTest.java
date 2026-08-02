package com.ssafy.backend.post.domain;

import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PostTest {

    /** 팬미팅 공지가 대상 팬미팅과 함께 즉시 공개 상태로 생성되는지 검증한다. */
    @Test
    void createsMeetingNoticeAsPublished() {
        User author = author(UserRole.MANAGER);
        FanMeeting meeting = meeting(author);

        Post notice = Post.createNotice(
                author, meeting, PostType.MEETING_NOTICE, "공지 제목", "공지 본문"
        );

        assertThat(notice.getType()).isEqualTo(PostType.MEETING_NOTICE);
        assertThat(notice.getMeeting()).isSameAs(meeting);
        assertThat(notice.getStatus()).isEqualTo(PostStatus.PUBLISHED);
        assertThat(notice.isPinned()).isFalse();
        assertThat(notice.getViewCount()).isZero();
        assertThat(notice.getDeletedAt()).isNull();
        assertThat(notice.isVisibleToPublic()).isTrue();
    }

    /** 서비스 공지가 팬미팅 없이 생성되는지 검증한다. */
    @Test
    void createsServiceNoticeWithoutMeeting() {
        User author = author(UserRole.ADMIN);

        Post notice = Post.createNotice(
                author, null, PostType.SERVICE_NOTICE, "서비스 공지", "서비스 본문"
        );

        assertThat(notice.getType()).isEqualTo(PostType.SERVICE_NOTICE);
        assertThat(notice.getMeeting()).isNull();
        assertThat(notice.getStatus()).isEqualTo(PostStatus.PUBLISHED);
    }

    /** 서비스 공지에 팬미팅을 지정하면 생성이 거부되는지 검증한다. */
    @Test
    void rejectsServiceNoticeWithMeeting() {
        User author = author(UserRole.ADMIN);
        FanMeeting meeting = meeting(author);

        assertThatThrownBy(() -> Post.createNotice(
                author, meeting, PostType.SERVICE_NOTICE, "제목", "본문"
        )).isInstanceOf(IllegalArgumentException.class);
    }

    /** 팬미팅 공지에 대상 팬미팅이 없으면 생성이 거부되는지 검증한다. */
    @Test
    void rejectsMeetingNoticeWithoutMeeting() {
        User author = author(UserRole.MANAGER);

        assertThatThrownBy(() -> Post.createNotice(
                author, null, PostType.MEETING_NOTICE, "제목", "본문"
        )).isInstanceOf(IllegalArgumentException.class);
    }

    /** 공지가 아닌 커뮤니티 유형은 공지 팩토리로 생성할 수 없는지 검증한다. */
    @Test
    void rejectsNonNoticeType() {
        User author = author(UserRole.MANAGER);
        FanMeeting meeting = meeting(author);

        assertThatThrownBy(() -> Post.createNotice(
                author, meeting, PostType.COMMUNITY, "제목", "본문"
        )).isInstanceOf(IllegalArgumentException.class);
    }

    /** 삭제되었거나 숨김 처리된 글이 일반 노출 대상에서 제외되는지 검증한다. */
    @Test
    void hidesDeletedOrHiddenPostFromPublicView() {
        User author = author(UserRole.MANAGER);
        Post deleted = Post.createNotice(
                author, meeting(author), PostType.MEETING_NOTICE, "제목", "본문"
        );
        ReflectionTestUtils.setField(deleted, "deletedAt", LocalDateTime.of(2026, 7, 30, 12, 0));
        Post hidden = Post.createNotice(
                author, meeting(author), PostType.MEETING_NOTICE, "제목", "본문"
        );
        ReflectionTestUtils.setField(hidden, "status", PostStatus.HIDDEN);

        assertThat(deleted.isVisibleToPublic()).isFalse();
        assertThat(hidden.isVisibleToPublic()).isFalse();
    }

    /** 테스트에 사용할 활성 사용자를 생성한다. */
    private User author(UserRole role) {
        User user = User.createActive(
                "notice-author", "notice-author@example.com", "encoded",
                "공지작성자", role, PreferredLanguage.KOREAN
        );
        ReflectionTestUtils.setField(user, "id", 1L);
        return user;
    }

    /** 테스트에 사용할 팬미팅을 생성한다. */
    private FanMeeting meeting(User influencer) {
        FanMeeting meeting = FanMeeting.create(
                null, null, influencer, "팬미팅", "설명", null,
                LocalDateTime.of(2026, 8, 1, 19, 0)
        );
        ReflectionTestUtils.setField(meeting, "id", 10L);
        return meeting;
    }
}
