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
import com.ssafy.backend.post.dto.NoticeCreateRequest;
import com.ssafy.backend.post.dto.NoticeCreateResponse;
import com.ssafy.backend.post.repository.PostRepository;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PostCommandServiceTest {

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
                currentUserService, meetingAccessService, postRepository
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
