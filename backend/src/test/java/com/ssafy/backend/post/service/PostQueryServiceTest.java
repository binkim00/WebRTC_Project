package com.ssafy.backend.post.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.post.domain.Post;
import com.ssafy.backend.post.domain.PostStatus;
import com.ssafy.backend.post.domain.PostType;
import com.ssafy.backend.post.dto.NoticeDetailResponse;
import com.ssafy.backend.post.dto.NoticeSummaryResponse;
import com.ssafy.backend.post.repository.PostRepository;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class PostQueryServiceTest {

    private static final long MEETING_ID = 10L;
    private static final long OTHER_MEETING_ID = 11L;
    private static final long NOTICE_ID = 100L;

    private CurrentUserService currentUserService;
    private MeetingAccessService meetingAccessService;
    private PostRepository postRepository;
    private PostQueryService queryService;

    /** 각 테스트마다 mock 협력 객체로 공지 조회 서비스를 새로 구성한다. */
    @BeforeEach
    void setUp() {
        currentUserService = mock(CurrentUserService.class);
        meetingAccessService = mock(MeetingAccessService.class);
        postRepository = mock(PostRepository.class);
        queryService = new PostQueryService(
                currentUserService, meetingAccessService, postRepository
        );
    }

    /** 서비스 공지 목록이 SERVICE_NOTICE·PUBLISHED 조건과 pinned 우선 정렬로 조회되는지 검증한다. */
    @Test
    void queriesServiceNoticesWithPinnedFirstSort() {
        Post notice = serviceNotice(NOTICE_ID, "서비스 공지");
        when(postRepository.findVisibleServiceNotices(
                any(), any(), any(), any(Pageable.class)
        )).thenReturn(new PageImpl<>(List.of(notice), PageRequest.of(0, 20), 1));

        PageResponse<NoticeSummaryResponse> response =
                queryService.getServiceNotices(null, 0, 20);

        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);
        verify(postRepository).findVisibleServiceNotices(
                eq(PostType.SERVICE_NOTICE), eq(PostStatus.PUBLISHED), eq("%"), pageable.capture()
        );
        assertThat(pageable.getValue().getSort()).isEqualTo(Sort.by(
                Sort.Order.desc("pinned"), Sort.Order.desc("createdAt"), Sort.Order.desc("id")
        ));
        assertThat(response.content()).hasSize(1);
        assertThat(response.content().get(0).noticeId()).isEqualTo(NOTICE_ID);
        assertThat(response.content().get(0).meetingId()).isNull();
        assertThat(response.content().get(0).thumbnailUrl()).isNull();
        assertThat(response.totalElements()).isEqualTo(1);
    }

    /** 검색어가 소문자 LIKE 패턴으로 변환되어 제목·본문 검색에 사용되는지 검증한다. */
    @Test
    void convertsKeywordToLowerCaseLikePattern() {
        when(postRepository.findVisibleServiceNotices(any(), any(), any(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        queryService.getServiceNotices("  Melly  ", 0, 20);

        verify(postRepository).findVisibleServiceNotices(
                eq(PostType.SERVICE_NOTICE), eq(PostStatus.PUBLISHED), eq("%melly%"), any(Pageable.class)
        );
    }

    /** 공지가 없으면 빈 목록과 0건 정보를 반환하는지 검증한다. */
    @Test
    void returnsEmptyPageWhenNoNoticeExists() {
        when(postRepository.findVisibleServiceNotices(any(), any(), any(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        PageResponse<NoticeSummaryResponse> response = queryService.getServiceNotices(null, 0, 20);

        assertThat(response.content()).isEmpty();
        assertThat(response.totalElements()).isZero();
        assertThat(response.totalPages()).isZero();
        assertThat(response.hasNext()).isFalse();
    }

    /** 허용 범위를 벗어난 페이지 번호와 크기가 거부되는지 검증한다. */
    @Test
    void rejectsOutOfRangePageValues() {
        assertThat(errorCodeOf(() -> queryService.getServiceNotices(null, -1, 20)))
                .isEqualTo(ErrorCode.INVALID_REQUEST);
        assertThat(errorCodeOf(() -> queryService.getServiceNotices(null, 0, 0)))
                .isEqualTo(ErrorCode.INVALID_REQUEST);
        assertThat(errorCodeOf(() -> queryService.getServiceNotices(null, 0, 101)))
                .isEqualTo(ErrorCode.INVALID_REQUEST);
        assertThat(errorCodeOf(() -> queryService.getMeetingNotices(MEETING_ID, null, 0, 101)))
                .isEqualTo(ErrorCode.INVALID_REQUEST);
        verifyNoInteractions(postRepository);
        verifyNoInteractions(meetingAccessService);
    }

    /** 허용 범위 경계인 크기 1과 100은 그대로 조회에 사용되는지 검증한다. */
    @Test
    void acceptsBoundaryPageSizes() {
        when(postRepository.findVisibleServiceNotices(any(), any(), any(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 1), 0));

        queryService.getServiceNotices(null, 0, 1);
        queryService.getServiceNotices(null, 0, PostQueryService.MAX_PAGE_SIZE);

        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);
        verify(postRepository, org.mockito.Mockito.times(2))
                .findVisibleServiceNotices(any(), any(), any(), pageable.capture());
        assertThat(pageable.getAllValues()).extracting(Pageable::getPageSize)
                .containsExactly(1, PostQueryService.MAX_PAGE_SIZE);
    }

    /** 팬미팅 공지 목록이 해당 팬미팅 식별자로만 조회되는지 검증한다. */
    @Test
    void queriesMeetingNoticesScopedToRequestedMeeting() {
        when(meetingAccessService.requireMeeting(MEETING_ID)).thenReturn(meeting(MEETING_ID));
        when(postRepository.findVisibleMeetingNotices(
                any(), anyLong(), any(), any(), any(Pageable.class)
        )).thenReturn(new PageImpl<>(
                List.of(meetingNotice(NOTICE_ID, MEETING_ID, "팬미팅 공지")), PageRequest.of(0, 20), 1
        ));

        PageResponse<NoticeSummaryResponse> response =
                queryService.getMeetingNotices(MEETING_ID, null, 0, 20);

        verify(postRepository).findVisibleMeetingNotices(
                eq(PostType.MEETING_NOTICE), eq(MEETING_ID), eq(PostStatus.PUBLISHED),
                eq("%"), any(Pageable.class)
        );
        assertThat(response.content()).hasSize(1);
        assertThat(response.content().get(0).meetingId()).isEqualTo(MEETING_ID);
    }

    /** 존재하지 않는 팬미팅의 공지 목록 조회가 거부되는지 검증한다. */
    @Test
    void rejectsMeetingNoticeListForMissingMeeting() {
        when(meetingAccessService.requireMeeting(MEETING_ID))
                .thenThrow(new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND));

        assertThat(errorCodeOf(() -> queryService.getMeetingNotices(MEETING_ID, null, 0, 20)))
                .isEqualTo(ErrorCode.FAN_MEETING_NOT_FOUND);
        verify(postRepository, never()).findVisibleMeetingNotices(
                any(), anyLong(), any(), any(), any(Pageable.class)
        );
    }

    /** 삭제된 팬미팅의 공지 목록 조회가 거부되는지 검증한다. */
    @Test
    void rejectsMeetingNoticeListForDeletedMeeting() {
        FanMeeting deleted = meeting(MEETING_ID);
        ReflectionTestUtils.setField(deleted, "deletedAt", LocalDateTime.of(2026, 7, 29, 9, 0));
        when(meetingAccessService.requireMeeting(MEETING_ID)).thenReturn(deleted);

        assertThat(errorCodeOf(() -> queryService.getMeetingNotices(MEETING_ID, null, 0, 20)))
                .isEqualTo(ErrorCode.FAN_MEETING_NOT_FOUND);
    }

    /** 비로그인 상세 조회에서 canEdit·canDelete가 false인지 검증한다. */
    @Test
    void returnsFalsePermissionsForAnonymousViewer() {
        when(postRepository.findDetailById(NOTICE_ID))
                .thenReturn(Optional.of(serviceNotice(NOTICE_ID, "서비스 공지")));

        NoticeDetailResponse response = queryService.getServiceNotice(NOTICE_ID, null);

        assertThat(response.canEdit()).isFalse();
        assertThat(response.canDelete()).isFalse();
        assertThat(response.attachments()).isEmpty();
        assertThat(response.content()).isEqualTo("본문");
        verifyNoInteractions(currentUserService);
    }

    /** 작성자 본인이 조회하면 canEdit·canDelete가 true인지 검증한다. */
    @Test
    void returnsTruePermissionsForAuthor() {
        Post notice = meetingNotice(NOTICE_ID, MEETING_ID, "팬미팅 공지");
        AuthenticatedUser principal = new AuthenticatedUser(1L, UserRole.MANAGER);
        when(meetingAccessService.requireMeeting(MEETING_ID)).thenReturn(meeting(MEETING_ID));
        when(postRepository.findDetailById(NOTICE_ID)).thenReturn(Optional.of(notice));
        when(currentUserService.requireActiveUser(principal)).thenReturn(notice.getAuthor());

        NoticeDetailResponse response =
                queryService.getMeetingNotice(MEETING_ID, NOTICE_ID, principal);

        assertThat(response.canEdit()).isTrue();
        assertThat(response.canDelete()).isTrue();
        assertThat(response.meetingId()).isEqualTo(MEETING_ID);
    }

    /** 작성자가 아닌 다른 사용자는 canEdit·canDelete가 false인지 검증한다. */
    @Test
    void returnsFalsePermissionsForOtherUser() {
        Post notice = meetingNotice(NOTICE_ID, MEETING_ID, "팬미팅 공지");
        AuthenticatedUser principal = new AuthenticatedUser(9L, UserRole.FAN);
        when(meetingAccessService.requireMeeting(MEETING_ID)).thenReturn(meeting(MEETING_ID));
        when(postRepository.findDetailById(NOTICE_ID)).thenReturn(Optional.of(notice));
        when(currentUserService.requireActiveUser(principal)).thenReturn(user(9L, UserRole.FAN));

        NoticeDetailResponse response =
                queryService.getMeetingNotice(MEETING_ID, NOTICE_ID, principal);

        assertThat(response.canEdit()).isFalse();
        assertThat(response.canDelete()).isFalse();
    }

    /** 서비스 운영자(ADMIN)는 작성자가 아니어도 canEdit·canDelete가 true인지 검증한다. */
    @Test
    void returnsTruePermissionsForAdmin() {
        AuthenticatedUser principal = new AuthenticatedUser(9L, UserRole.ADMIN);
        when(postRepository.findDetailById(NOTICE_ID))
                .thenReturn(Optional.of(serviceNotice(NOTICE_ID, "서비스 공지")));
        when(currentUserService.requireActiveUser(principal)).thenReturn(user(9L, UserRole.ADMIN));

        NoticeDetailResponse response = queryService.getServiceNotice(NOTICE_ID, principal);

        assertThat(response.canEdit()).isTrue();
        assertThat(response.canDelete()).isTrue();
    }

    /** 존재하지 않는 공지 상세 조회가 거부되는지 검증한다. */
    @Test
    void rejectsMissingNotice() {
        when(postRepository.findDetailById(NOTICE_ID)).thenReturn(Optional.empty());

        assertThat(errorCodeOf(() -> queryService.getServiceNotice(NOTICE_ID, null)))
                .isEqualTo(ErrorCode.POST_NOT_FOUND);
    }

    /** 경로가 고정한 유형과 다른 게시글은 유형 불일치로 거부되는지 검증한다. */
    @Test
    void rejectsTypeMismatchBetweenPathAndPost() {
        when(postRepository.findDetailById(NOTICE_ID))
                .thenReturn(Optional.of(meetingNotice(NOTICE_ID, MEETING_ID, "팬미팅 공지")));

        assertThat(errorCodeOf(() -> queryService.getServiceNotice(NOTICE_ID, null)))
                .isEqualTo(ErrorCode.POST_TYPE_MISMATCH);
    }

    /** 다른 팬미팅의 공지는 요청한 팬미팅 경로에서 조회되지 않는지 검증한다. */
    @Test
    void rejectsNoticeOfAnotherMeeting() {
        when(meetingAccessService.requireMeeting(MEETING_ID)).thenReturn(meeting(MEETING_ID));
        when(postRepository.findDetailById(NOTICE_ID))
                .thenReturn(Optional.of(meetingNotice(NOTICE_ID, OTHER_MEETING_ID, "다른 팬미팅 공지")));

        assertThat(errorCodeOf(() -> queryService.getMeetingNotice(MEETING_ID, NOTICE_ID, null)))
                .isEqualTo(ErrorCode.POST_NOT_FOUND);
    }

    /** 삭제된 공지가 상세 조회에서 제외되는지 검증한다. */
    @Test
    void rejectsDeletedNotice() {
        Post notice = serviceNotice(NOTICE_ID, "서비스 공지");
        ReflectionTestUtils.setField(notice, "deletedAt", LocalDateTime.of(2026, 7, 29, 9, 0));
        when(postRepository.findDetailById(NOTICE_ID)).thenReturn(Optional.of(notice));

        assertThat(errorCodeOf(() -> queryService.getServiceNotice(NOTICE_ID, null)))
                .isEqualTo(ErrorCode.POST_NOT_FOUND);
    }

    /** 숨김 처리된 공지가 상세 조회에서 제외되는지 검증한다. */
    @Test
    void rejectsHiddenNotice() {
        Post notice = serviceNotice(NOTICE_ID, "서비스 공지");
        ReflectionTestUtils.setField(notice, "status", PostStatus.HIDDEN);
        when(postRepository.findDetailById(NOTICE_ID)).thenReturn(Optional.of(notice));

        assertThat(errorCodeOf(() -> queryService.getServiceNotice(NOTICE_ID, null)))
                .isEqualTo(ErrorCode.POST_NOT_FOUND);
    }

    /**
     * 실행 결과로 발생한 비즈니스 예외의 오류 코드를 꺼낸다.
     *
     * @param runnable 검증할 조회 호출
     * @return 발생한 비즈니스 예외의 오류 코드
     */
    private ErrorCode errorCodeOf(Runnable runnable) {
        try {
            runnable.run();
        } catch (BusinessException exception) {
            return exception.getErrorCode();
        }
        throw new AssertionError("BusinessException이 발생하지 않았습니다.");
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

    /** 테스트에 사용할 팬미팅을 생성한다. */
    private FanMeeting meeting(Long meetingId) {
        FanMeeting meeting = FanMeeting.create(
                null, null, user(2L, UserRole.INFLUENCER), "팬미팅", "설명", null,
                LocalDateTime.of(2026, 8, 1, 19, 0)
        );
        ReflectionTestUtils.setField(meeting, "id", meetingId);
        return meeting;
    }

    /** 식별자와 제목을 지정한 서비스 공지를 생성한다. */
    private Post serviceNotice(Long noticeId, String title) {
        Post notice = Post.createNotice(
                user(1L, UserRole.ADMIN), null, PostType.SERVICE_NOTICE, title, "본문"
        );
        ReflectionTestUtils.setField(notice, "id", noticeId);
        ReflectionTestUtils.setField(notice, "createdAt", LocalDateTime.of(2026, 7, 30, 10, 0));
        ReflectionTestUtils.setField(notice, "updatedAt", LocalDateTime.of(2026, 7, 30, 10, 0));
        return notice;
    }

    /** 식별자·팬미팅·제목을 지정한 팬미팅 공지를 생성한다. */
    private Post meetingNotice(Long noticeId, Long meetingId, String title) {
        Post notice = Post.createNotice(
                user(1L, UserRole.MANAGER), meeting(meetingId), PostType.MEETING_NOTICE, title, "본문"
        );
        ReflectionTestUtils.setField(notice, "id", noticeId);
        ReflectionTestUtils.setField(notice, "createdAt", LocalDateTime.of(2026, 7, 30, 10, 0));
        ReflectionTestUtils.setField(notice, "updatedAt", LocalDateTime.of(2026, 7, 30, 10, 0));
        return notice;
    }
}
