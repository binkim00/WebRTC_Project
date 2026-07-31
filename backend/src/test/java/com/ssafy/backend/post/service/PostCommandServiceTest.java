package com.ssafy.backend.post.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.post.domain.Post;
import com.ssafy.backend.post.domain.PostStatus;
import com.ssafy.backend.post.domain.PostType;
import com.ssafy.backend.post.dto.CommunityPostCreateRequest;
import com.ssafy.backend.post.dto.CommunityPostCreateResponse;
import com.ssafy.backend.post.dto.NoticeCreateRequest;
import com.ssafy.backend.post.dto.NoticeCreateResponse;
import com.ssafy.backend.post.dto.PostDeleteResponse;
import com.ssafy.backend.post.dto.PostUpdateRequest;
import com.ssafy.backend.post.dto.PostUpdateResponse;
import com.ssafy.backend.post.repository.PostRepository;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PostCommandServiceTest {

    /** 논리 삭제 시각을 고정해 검증하기 위한 시계다. */
    private static final Clock CLOCK = Clock.fixed(
            Instant.parse("2026-07-31T02:00:00Z"), ZoneOffset.UTC);

    /** 고정 시계가 만들어 내는 논리 삭제 시각이다. */
    private static final LocalDateTime DELETED_AT = LocalDateTime.of(2026, 7, 31, 2, 0);

    private static final AuthenticatedUser MANAGER_PRINCIPAL =
            new AuthenticatedUser(1L, UserRole.MANAGER);
    private static final long MEETING_ID = 10L;

    private CurrentUserService currentUserService;
    private MeetingAccessService meetingAccessService;
    private PostRepository postRepository;
    private PostCommandService commandService;

    /** 각 테스트마다 mock 협력 객체로 공지 작성 서비스를 새로 구성한다. */
    @BeforeEach
    void setUp() {
        currentUserService = mock(CurrentUserService.class);
        meetingAccessService = mock(MeetingAccessService.class);
        postRepository = mock(PostRepository.class);
        commandService = new PostCommandService(
                currentUserService, meetingAccessService, postRepository, CLOCK
        );
    }

    /** 운영자가 작성한 팬미팅 공지가 MEETING_NOTICE·PUBLISHED로 저장되는지 검증한다. */
    @Test
    void savesMeetingNoticeAsPublishedMeetingNotice() {
        User author = user(1L, UserRole.MANAGER);
        FanMeeting meeting = meeting(FanMeetingStatus.PUBLISHED);
        when(currentUserService.requireActiveUser(MANAGER_PRINCIPAL)).thenReturn(author);
        when(meetingAccessService.requireOperator(MEETING_ID, author)).thenReturn(meeting);
        when(postRepository.save(any(Post.class))).thenAnswer(invocation -> {
            Post saved = invocation.getArgument(0);
            ReflectionTestUtils.setField(saved, "id", 100L);
            ReflectionTestUtils.setField(saved, "createdAt", LocalDateTime.of(2026, 7, 30, 10, 0));
            return saved;
        });

        NoticeCreateResponse response = commandService.createMeetingNotice(
                MEETING_ID, new NoticeCreateRequest("공지 제목", "공지 본문"), MANAGER_PRINCIPAL
        );

        ArgumentCaptor<Post> captor = ArgumentCaptor.forClass(Post.class);
        verify(postRepository).save(captor.capture());
        Post saved = captor.getValue();
        assertThat(saved.getType()).isEqualTo(PostType.MEETING_NOTICE);
        assertThat(saved.getStatus()).isEqualTo(PostStatus.PUBLISHED);
        assertThat(saved.getMeeting()).isSameAs(meeting);
        assertThat(saved.getAuthor()).isSameAs(author);
        assertThat(response.noticeId()).isEqualTo(100L);
        assertThat(response.meetingId()).isEqualTo(MEETING_ID);
        assertThat(response.title()).isEqualTo("공지 제목");
        assertThat(response.createdAt()).isEqualTo(LocalDateTime.of(2026, 7, 30, 10, 0));
    }

    /** 제목과 본문 앞뒤 공백이 제거된 상태로 저장되는지 검증한다. */
    @Test
    void trimsTitleAndContentBeforeSaving() {
        User author = user(1L, UserRole.MANAGER);
        when(currentUserService.requireActiveUser(MANAGER_PRINCIPAL)).thenReturn(author);
        when(meetingAccessService.requireOperator(MEETING_ID, author))
                .thenReturn(meeting(FanMeetingStatus.READY));
        when(postRepository.save(any(Post.class))).thenAnswer(invocation -> invocation.getArgument(0));

        commandService.createMeetingNotice(
                MEETING_ID, new NoticeCreateRequest("  제목  ", "  본문  "), MANAGER_PRINCIPAL
        );

        ArgumentCaptor<Post> captor = ArgumentCaptor.forClass(Post.class);
        verify(postRepository).save(captor.capture());
        assertThat(captor.getValue().getTitle()).isEqualTo("제목");
        assertThat(captor.getValue().getContent()).isEqualTo("본문");
    }

    /** 해당 팬미팅 운영자가 아니면 공지를 작성하지 못하는지 검증한다. */
    @Test
    void rejectsNonOperator() {
        User author = user(1L, UserRole.MANAGER);
        when(currentUserService.requireActiveUser(MANAGER_PRINCIPAL)).thenReturn(author);
        when(meetingAccessService.requireOperator(MEETING_ID, author))
                .thenThrow(new BusinessException(ErrorCode.ACCESS_DENIED));

        assertThatThrownBy(() -> commandService.createMeetingNotice(
                MEETING_ID, new NoticeCreateRequest("제목", "본문"), MANAGER_PRINCIPAL
        ))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.ACCESS_DENIED);
        verify(postRepository, never()).save(any(Post.class));
    }

    /** 존재하지 않는 팬미팅에는 공지를 작성하지 못하는지 검증한다. */
    @Test
    void rejectsMissingMeeting() {
        User author = user(1L, UserRole.MANAGER);
        when(currentUserService.requireActiveUser(MANAGER_PRINCIPAL)).thenReturn(author);
        when(meetingAccessService.requireOperator(MEETING_ID, author))
                .thenThrow(new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND));

        assertThatThrownBy(() -> commandService.createMeetingNotice(
                MEETING_ID, new NoticeCreateRequest("제목", "본문"), MANAGER_PRINCIPAL
        ))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.FAN_MEETING_NOT_FOUND);
        verify(postRepository, never()).save(any(Post.class));
    }

    /** 삭제된 팬미팅에는 공지를 작성하지 못하는지 검증한다. */
    @Test
    void rejectsDeletedMeeting() {
        User author = user(1L, UserRole.MANAGER);
        FanMeeting meeting = meeting(FanMeetingStatus.PUBLISHED);
        ReflectionTestUtils.setField(meeting, "deletedAt", LocalDateTime.of(2026, 7, 29, 9, 0));
        when(currentUserService.requireActiveUser(MANAGER_PRINCIPAL)).thenReturn(author);
        when(meetingAccessService.requireOperator(MEETING_ID, author)).thenReturn(meeting);

        assertThatThrownBy(() -> commandService.createMeetingNotice(
                MEETING_ID, new NoticeCreateRequest("제목", "본문"), MANAGER_PRINCIPAL
        ))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.FAN_MEETING_NOT_FOUND);
        verify(postRepository, never()).save(any(Post.class));
    }

    /** 취소된 팬미팅에는 공지를 작성하지 못하는지 검증한다. */
    @Test
    void rejectsCanceledMeeting() {
        User author = user(1L, UserRole.MANAGER);
        when(currentUserService.requireActiveUser(MANAGER_PRINCIPAL)).thenReturn(author);
        when(meetingAccessService.requireOperator(MEETING_ID, author))
                .thenReturn(meeting(FanMeetingStatus.CANCELED));

        assertThatThrownBy(() -> commandService.createMeetingNotice(
                MEETING_ID, new NoticeCreateRequest("제목", "본문"), MANAGER_PRINCIPAL
        ))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.FAN_MEETING_STATE_CONFLICT);
        verify(postRepository, never()).save(any(Post.class));
    }

    /** 인증 정보가 없으면 공지를 작성하지 못하는지 검증한다. */
    @Test
    void rejectsUnauthenticatedWriter() {
        when(currentUserService.requireActiveUser(null))
                .thenThrow(new BusinessException(ErrorCode.AUTHENTICATION_REQUIRED));

        assertThatThrownBy(() -> commandService.createMeetingNotice(
                MEETING_ID, new NoticeCreateRequest("제목", "본문"), null
        ))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.AUTHENTICATION_REQUIRED);
        verify(postRepository, never()).save(any(Post.class));
    }

    /** 커뮤니티 글이 COMMUNITY·PUBLISHED로 팬미팅에 연결되어 저장되는지 검증한다. */
    @Test
    void savesCommunityPostAsPublishedCommunityType() {
        User author = user(1L, UserRole.MANAGER);
        FanMeeting meeting = meeting(FanMeetingStatus.PUBLISHED);
        when(currentUserService.requireActiveUser(MANAGER_PRINCIPAL)).thenReturn(author);
        when(meetingAccessService.requireOperator(MEETING_ID, author)).thenReturn(meeting);
        when(postRepository.save(any(Post.class))).thenAnswer(invocation -> {
            Post saved = invocation.getArgument(0);
            ReflectionTestUtils.setField(saved, "id", 200L);
            ReflectionTestUtils.setField(saved, "createdAt", LocalDateTime.of(2026, 7, 31, 10, 0));
            return saved;
        });

        CommunityPostCreateResponse response = commandService.createCommunityPost(
                MEETING_ID, new CommunityPostCreateRequest("  글 제목  ", "  글 본문  "),
                MANAGER_PRINCIPAL
        );

        ArgumentCaptor<Post> captor = ArgumentCaptor.forClass(Post.class);
        verify(postRepository).save(captor.capture());
        Post saved = captor.getValue();
        assertThat(saved.getType()).isEqualTo(PostType.COMMUNITY);
        assertThat(saved.getStatus()).isEqualTo(PostStatus.PUBLISHED);
        assertThat(saved.getMeeting()).isSameAs(meeting);
        assertThat(saved.getTitle()).isEqualTo("글 제목");
        assertThat(saved.getContent()).isEqualTo("글 본문");
        assertThat(response.postId()).isEqualTo(200L);
        assertThat(response.meetingId()).isEqualTo(MEETING_ID);
    }

    /** 취소·삭제된 팬미팅에는 커뮤니티 글을 작성하지 못하는지 검증한다. */
    @Test
    void rejectsCommunityPostOnUnavailableMeeting() {
        User author = user(1L, UserRole.MANAGER);
        when(currentUserService.requireActiveUser(MANAGER_PRINCIPAL)).thenReturn(author);
        when(meetingAccessService.requireOperator(MEETING_ID, author))
                .thenReturn(meeting(FanMeetingStatus.CANCELED));

        assertThatThrownBy(() -> commandService.createCommunityPost(
                MEETING_ID, new CommunityPostCreateRequest("제목", "본문"), MANAGER_PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.FAN_MEETING_STATE_CONFLICT);
        verify(postRepository, never()).save(any(Post.class));
    }

    /** 공지 수정이 보내지 않은 항목을 유지하고 공백을 제거하는지 검증한다. */
    @Test
    void updatesNoticeWithProvidedFieldsOnly() {
        User author = user(1L, UserRole.MANAGER);
        Post notice = notice(1L);
        when(currentUserService.requireActiveUser(MANAGER_PRINCIPAL)).thenReturn(author);
        when(postRepository.findDetailById(300L)).thenReturn(Optional.of(notice));

        PostUpdateResponse response = commandService.updateMeetingNotice(
                MEETING_ID, 300L, new PostUpdateRequest("  새 제목  ", null), MANAGER_PRINCIPAL
        );

        assertThat(notice.getTitle()).isEqualTo("새 제목");
        assertThat(notice.getContent()).isEqualTo("본문");
        assertThat(response.postId()).isEqualTo(300L);
        assertThat(response.meetingId()).isEqualTo(MEETING_ID);
    }

    /** 작성자도 ADMIN도 아닌 사용자의 공지 수정이 거부되는지 검증한다. */
    @Test
    void rejectsNoticeUpdateByNonAuthor() {
        User outsider = user(7L, UserRole.MANAGER);
        AuthenticatedUser principal = new AuthenticatedUser(7L, UserRole.MANAGER);
        Post notice = notice(1L);
        when(currentUserService.requireActiveUser(principal)).thenReturn(outsider);
        when(postRepository.findDetailById(300L)).thenReturn(Optional.of(notice));

        assertThatThrownBy(() -> commandService.updateMeetingNotice(
                MEETING_ID, 300L, new PostUpdateRequest("남의 공지", null), principal))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.ACCESS_DENIED);
        assertThat(notice.getTitle()).isEqualTo("공지 제목");
    }

    /** 다른 팬미팅 경로로 들어온 공지 수정이 거부되는지 검증한다. */
    @Test
    void rejectsNoticeUpdateThroughAnotherMeetingPath() {
        User author = user(1L, UserRole.MANAGER);
        when(currentUserService.requireActiveUser(MANAGER_PRINCIPAL)).thenReturn(author);
        when(postRepository.findDetailById(300L)).thenReturn(Optional.of(notice(1L)));

        assertThatThrownBy(() -> commandService.updateMeetingNotice(
                MEETING_ID + 1, 300L, new PostUpdateRequest("제목", null), MANAGER_PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.POST_NOT_FOUND);
    }

    /** 작성자의 공지 삭제가 고정 시계 기준 논리 삭제로 처리되는지 검증한다. */
    @Test
    void softDeletesNoticeByAuthorWithFixedClock() {
        User author = user(1L, UserRole.MANAGER);
        Post notice = notice(1L);
        when(currentUserService.requireActiveUser(MANAGER_PRINCIPAL)).thenReturn(author);
        when(postRepository.findDetailById(300L)).thenReturn(Optional.of(notice));

        PostDeleteResponse response = commandService.deleteMeetingNotice(
                MEETING_ID, 300L, MANAGER_PRINCIPAL);

        assertThat(notice.getDeletedAt()).isEqualTo(DELETED_AT);
        assertThat(notice.getStatus()).isEqualTo(PostStatus.PUBLISHED);
        assertThat(response.deletedAt()).isEqualTo(DELETED_AT);
        assertThat(response.status()).isEqualTo("PUBLISHED");
    }

    /** 작성자가 아닌 ADMIN의 공지 삭제가 숨김 처리로 반영되는지 검증한다. */
    @Test
    void hidesNoticeWhenAdminDeletesOthersNotice() {
        User admin = user(9L, UserRole.ADMIN);
        AuthenticatedUser principal = new AuthenticatedUser(9L, UserRole.ADMIN);
        Post notice = notice(1L);
        when(currentUserService.requireActiveUser(principal)).thenReturn(admin);
        when(postRepository.findDetailById(300L)).thenReturn(Optional.of(notice));

        PostDeleteResponse response = commandService.deleteMeetingNotice(MEETING_ID, 300L, principal);

        assertThat(notice.getStatus()).isEqualTo(PostStatus.HIDDEN);
        assertThat(notice.getDeletedAt()).isNull();
        assertThat(response.status()).isEqualTo("HIDDEN");
        assertThat(response.deletedAt()).isNull();
    }

    /** 커뮤니티 글 수정이 작성자에게만 허용되는지 검증한다. */
    @Test
    void allowsCommunityUpdateOnlyForAuthor() {
        User author = user(1L, UserRole.MANAGER);
        Post post = communityPost(1L);
        when(currentUserService.requireActiveUser(MANAGER_PRINCIPAL)).thenReturn(author);
        when(postRepository.findDetailById(400L)).thenReturn(Optional.of(post));

        commandService.updateCommunityPost(
                400L, new PostUpdateRequest(null, "  새 본문  "), MANAGER_PRINCIPAL);

        assertThat(post.getTitle()).isEqualTo("커뮤니티 제목");
        assertThat(post.getContent()).isEqualTo("새 본문");
    }

    /** 소유 운영자라도 다른 사람의 커뮤니티 글은 수정하지 못하는지 검증한다. */
    @Test
    void rejectsCommunityUpdateByOperatorWhoIsNotAuthor() {
        User influencer = user(2L, UserRole.INFLUENCER);
        AuthenticatedUser principal = new AuthenticatedUser(2L, UserRole.INFLUENCER);
        Post post = communityPost(1L);
        when(currentUserService.requireActiveUser(principal)).thenReturn(influencer);
        when(postRepository.findDetailById(400L)).thenReturn(Optional.of(post));

        assertThatThrownBy(() -> commandService.updateCommunityPost(
                400L, new PostUpdateRequest("남의 글", null), principal))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.ACCESS_DENIED);
        verify(meetingAccessService, never()).requireOperator(anyLong(), any(User.class));
    }

    /** 작성자의 커뮤니티 글 삭제가 논리 삭제로 처리되는지 검증한다. */
    @Test
    void softDeletesCommunityPostByAuthor() {
        User author = user(1L, UserRole.MANAGER);
        Post post = communityPost(1L);
        when(currentUserService.requireActiveUser(MANAGER_PRINCIPAL)).thenReturn(author);
        when(postRepository.findDetailById(400L)).thenReturn(Optional.of(post));

        PostDeleteResponse response = commandService.deleteCommunityPost(400L, MANAGER_PRINCIPAL);

        assertThat(post.getDeletedAt()).isEqualTo(DELETED_AT);
        assertThat(response.status()).isEqualTo("PUBLISHED");
        verify(meetingAccessService, never()).requireOperator(anyLong(), any(User.class));
    }

    /** 작성자가 아닌 소유 운영자의 커뮤니티 글 삭제가 숨김 처리로 반영되는지 검증한다. */
    @Test
    void hidesCommunityPostWhenOwningOperatorDeletesOthersPost() {
        User influencer = user(2L, UserRole.INFLUENCER);
        AuthenticatedUser principal = new AuthenticatedUser(2L, UserRole.INFLUENCER);
        Post post = communityPost(1L);
        when(currentUserService.requireActiveUser(principal)).thenReturn(influencer);
        when(postRepository.findDetailById(400L)).thenReturn(Optional.of(post));
        when(meetingAccessService.requireOperator(MEETING_ID, influencer))
                .thenReturn(post.getMeeting());

        PostDeleteResponse response = commandService.deleteCommunityPost(400L, principal);

        assertThat(post.getStatus()).isEqualTo(PostStatus.HIDDEN);
        assertThat(post.getDeletedAt()).isNull();
        assertThat(response.status()).isEqualTo("HIDDEN");
    }

    /** 소유 운영자가 아닌 사용자의 커뮤니티 글 삭제가 거부되는지 검증한다. */
    @Test
    void rejectsCommunityDeleteByNonOperator() {
        User outsider = user(8L, UserRole.FAN);
        AuthenticatedUser principal = new AuthenticatedUser(8L, UserRole.FAN);
        Post post = communityPost(1L);
        when(currentUserService.requireActiveUser(principal)).thenReturn(outsider);
        when(postRepository.findDetailById(400L)).thenReturn(Optional.of(post));
        when(meetingAccessService.requireOperator(MEETING_ID, outsider))
                .thenThrow(new BusinessException(ErrorCode.ACCESS_DENIED));

        assertThatThrownBy(() -> commandService.deleteCommunityPost(400L, principal))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.ACCESS_DENIED);
        assertThat(post.getDeletedAt()).isNull();
        assertThat(post.getStatus()).isEqualTo(PostStatus.PUBLISHED);
    }

    /** 삭제된 글의 재삭제가 존재하지 않는 글과 같은 오류를 반환하는지 검증한다. */
    @Test
    void rejectsDeletingAlreadyDeletedCommunityPost() {
        User author = user(1L, UserRole.MANAGER);
        Post post = communityPost(1L);
        ReflectionTestUtils.setField(post, "deletedAt", LocalDateTime.of(2026, 7, 30, 9, 0));
        when(currentUserService.requireActiveUser(MANAGER_PRINCIPAL)).thenReturn(author);
        when(postRepository.findDetailById(400L)).thenReturn(Optional.of(post));

        assertThatThrownBy(() -> commandService.deleteCommunityPost(400L, MANAGER_PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.POST_NOT_FOUND);
    }

    /** 커뮤니티 경로로 공지를 다루면 유형 불일치 오류가 발생하는지 검증한다. */
    @Test
    void rejectsNoticeThroughCommunityCommandPath() {
        User author = user(1L, UserRole.MANAGER);
        when(currentUserService.requireActiveUser(MANAGER_PRINCIPAL)).thenReturn(author);
        when(postRepository.findDetailById(300L)).thenReturn(Optional.of(notice(1L)));

        assertThatThrownBy(() -> commandService.deleteCommunityPost(300L, MANAGER_PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.POST_TYPE_MISMATCH);
    }

    /** 지정한 작성자의 팬미팅 공지를 생성한다. */
    private Post notice(Long authorId) {
        Post notice = Post.createNotice(
                user(authorId, UserRole.MANAGER), meeting(FanMeetingStatus.PUBLISHED),
                PostType.MEETING_NOTICE, "공지 제목", "본문"
        );
        ReflectionTestUtils.setField(notice, "id", 300L);
        return notice;
    }

    /** 지정한 작성자의 커뮤니티 게시글을 생성한다. */
    private Post communityPost(Long authorId) {
        Post post = Post.createCommunity(
                user(authorId, UserRole.MANAGER), meeting(FanMeetingStatus.PUBLISHED),
                "커뮤니티 제목", "본문"
        );
        ReflectionTestUtils.setField(post, "id", 400L);
        return post;
    }

    /** 테스트에 사용할 활성 사용자를 생성한다. */
    private User user(Long id, UserRole role) {
        User user = User.createActive(
                "user" + id, "user" + id + "@example.com", "encoded",
                "사용자" + id, role, PreferredLanguage.KOREAN
        );
        ReflectionTestUtils.setField(user, "id", id);
        return user;
    }

    /** 지정한 상태의 팬미팅을 생성한다. */
    private FanMeeting meeting(FanMeetingStatus status) {
        FanMeeting meeting = FanMeeting.create(
                null, null, user(2L, UserRole.INFLUENCER), "팬미팅", "설명", null,
                LocalDateTime.of(2026, 8, 1, 19, 0)
        );
        ReflectionTestUtils.setField(meeting, "id", MEETING_ID);
        ReflectionTestUtils.setField(meeting, "status", status);
        return meeting;
    }
}
