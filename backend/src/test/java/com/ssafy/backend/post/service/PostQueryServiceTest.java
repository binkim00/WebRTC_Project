package com.ssafy.backend.post.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.organization.repository.OrganizationMemberRepository;
import com.ssafy.backend.post.domain.Post;
import com.ssafy.backend.post.domain.PostStatus;
import com.ssafy.backend.post.domain.PostType;
import com.ssafy.backend.post.dto.CommunityPostDetailResponse;
import com.ssafy.backend.post.dto.CommunityPostSummaryResponse;
import com.ssafy.backend.post.dto.NoticeDetailResponse;
import com.ssafy.backend.post.dto.NoticeSummaryResponse;
import com.ssafy.backend.post.repository.PostCommentRepository;
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
    private OrganizationMemberRepository organizationMemberRepository;
    private PostRepository postRepository;
    private PostCommentRepository postCommentRepository;
    private PostQueryService queryService;

    /** 각 테스트마다 mock 협력 객체로 공지·커뮤니티 조회 서비스를 새로 구성한다. */
    @BeforeEach
    void setUp() {
        currentUserService = mock(CurrentUserService.class);
        meetingAccessService = mock(MeetingAccessService.class);
        organizationMemberRepository = mock(OrganizationMemberRepository.class);
        postRepository = mock(PostRepository.class);
        postCommentRepository = mock(PostCommentRepository.class);
        queryService = new PostQueryService(
                currentUserService, meetingAccessService, organizationMemberRepository,
                postRepository, postCommentRepository
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

    /** 커뮤니티 목록이 COMMUNITY·PUBLISHED 조건과 pinned 우선 정렬로 조회되는지 검증한다. */
    @Test
    void findsCommunityPostsWithPinnedFirstSort() {
        Post post = communityPost(200L, MEETING_ID, 1L, "커뮤니티 글");
        when(meetingAccessService.requireMeeting(MEETING_ID)).thenReturn(meeting(MEETING_ID));
        when(postRepository.findVisibleCommunityPosts(
                eq(MEETING_ID), eq(PostStatus.PUBLISHED), eq("%"), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(post), PageRequest.of(0, 20), 1));

        PageResponse<CommunityPostSummaryResponse> response =
                queryService.getCommunityPosts(MEETING_ID, null, 0, 20);

        ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);
        verify(postRepository).findVisibleCommunityPosts(
                eq(MEETING_ID), eq(PostStatus.PUBLISHED), eq("%"), captor.capture());
        assertThat(captor.getValue().getSort()).isEqualTo(Sort.by(
                Sort.Order.desc("pinned"), Sort.Order.desc("createdAt"), Sort.Order.desc("id")));
        assertThat(response.content()).hasSize(1);
        assertThat(response.content().get(0).postId()).isEqualTo(200L);
        assertThat(response.content().get(0).meetingId()).isEqualTo(MEETING_ID);
    }

    /** 커뮤니티 목록 검색어가 소문자 LIKE 패턴으로 변환되는지 검증한다. */
    @Test
    void convertsCommunityKeywordToLowerCaseLikePattern() {
        when(meetingAccessService.requireMeeting(MEETING_ID)).thenReturn(meeting(MEETING_ID));
        when(postRepository.findVisibleCommunityPosts(
                anyLong(), any(PostStatus.class), any(String.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        queryService.getCommunityPosts(MEETING_ID, "  GoodS  ", 0, 20);

        verify(postRepository).findVisibleCommunityPosts(
                eq(MEETING_ID), eq(PostStatus.PUBLISHED), eq("%goods%"), any(Pageable.class));
    }

    /** 커뮤니티 목록의 페이지 값 경계가 검증되는지 확인한다. */
    @Test
    void validatesCommunityPageBoundaries() {
        assertThat(errorCodeOf(() -> queryService.getCommunityPosts(MEETING_ID, null, -1, 20)))
                .isEqualTo(ErrorCode.INVALID_REQUEST);
        assertThat(errorCodeOf(() -> queryService.getCommunityPosts(MEETING_ID, null, 0, 0)))
                .isEqualTo(ErrorCode.INVALID_REQUEST);
        assertThat(errorCodeOf(() -> queryService.getCommunityPosts(MEETING_ID, null, 0, 101)))
                .isEqualTo(ErrorCode.INVALID_REQUEST);
        verifyNoInteractions(postRepository);
    }

    /** 작성자 본인 조회에서 수정·삭제가 모두 가능하다고 계산되는지 검증한다. */
    @Test
    void marksAuthorAsAbleToEditAndDeleteCommunityPost() {
        Post post = communityPost(200L, MEETING_ID, 5L, "내 글");
        User author = user(5L, UserRole.SOLO_INFLUENCER);
        AuthenticatedUser principal = new AuthenticatedUser(5L, UserRole.SOLO_INFLUENCER);
        when(postRepository.findDetailById(200L)).thenReturn(Optional.of(post));
        when(currentUserService.requireActiveUser(principal)).thenReturn(author);
        when(postCommentRepository.countVisibleByPost(200L)).thenReturn(3L);

        CommunityPostDetailResponse response = queryService.getCommunityPost(200L, principal);

        assertThat(response.canEdit()).isTrue();
        assertThat(response.canDelete()).isTrue();
        assertThat(response.commentCount()).isEqualTo(3L);
        assertThat(response.attachments()).isEmpty();
        assertThat(response.thumbnailUrl()).isNull();
    }

    /** 소유 운영자는 삭제만 가능하고 수정은 불가능하다고 계산되는지 검증한다. */
    @Test
    void marksOwningOperatorAsDeleteOnlyForOthersCommunityPost() {
        // 팬미팅 주최 인플루언서(2L)가 다른 사람(5L)의 글을 조회한다.
        Post post = communityPost(200L, MEETING_ID, 5L, "남의 글");
        User influencer = user(2L, UserRole.INFLUENCER);
        AuthenticatedUser principal = new AuthenticatedUser(2L, UserRole.INFLUENCER);
        when(postRepository.findDetailById(200L)).thenReturn(Optional.of(post));
        when(currentUserService.requireActiveUser(principal)).thenReturn(influencer);
        when(postCommentRepository.countVisibleByPost(200L)).thenReturn(0L);

        CommunityPostDetailResponse response = queryService.getCommunityPost(200L, principal);

        assertThat(response.canEdit()).isFalse();
        assertThat(response.canDelete()).isTrue();
    }

    /** 비로그인 조회에서는 수정·삭제가 모두 불가능하다고 계산되는지 검증한다. */
    @Test
    void marksAnonymousViewerAsUnableToModifyCommunityPost() {
        Post post = communityPost(200L, MEETING_ID, 5L, "글");
        when(postRepository.findDetailById(200L)).thenReturn(Optional.of(post));
        when(postCommentRepository.countVisibleByPost(200L)).thenReturn(0L);

        CommunityPostDetailResponse response = queryService.getCommunityPost(200L, null);

        assertThat(response.canEdit()).isFalse();
        assertThat(response.canDelete()).isFalse();
        verifyNoInteractions(currentUserService);
    }

    /** 관계없는 사용자는 수정·삭제가 모두 불가능하다고 계산되는지 검증한다. */
    @Test
    void marksUnrelatedViewerAsUnableToModifyCommunityPost() {
        Post post = communityPost(200L, MEETING_ID, 5L, "글");
        User outsider = user(9L, UserRole.FAN);
        AuthenticatedUser principal = new AuthenticatedUser(9L, UserRole.FAN);
        when(postRepository.findDetailById(200L)).thenReturn(Optional.of(post));
        when(currentUserService.requireActiveUser(principal)).thenReturn(outsider);
        when(postCommentRepository.countVisibleByPost(200L)).thenReturn(0L);

        CommunityPostDetailResponse response = queryService.getCommunityPost(200L, principal);

        assertThat(response.canEdit()).isFalse();
        assertThat(response.canDelete()).isFalse();
    }

    /** 공지를 커뮤니티 상세로 조회하면 유형 불일치 오류가 발생하는지 검증한다. */
    @Test
    void rejectsNoticeThroughCommunityDetail() {
        when(postRepository.findDetailById(100L))
                .thenReturn(Optional.of(meetingNotice(100L, MEETING_ID, "공지")));

        assertThat(errorCodeOf(() -> queryService.getCommunityPost(100L, null)))
                .isEqualTo(ErrorCode.POST_TYPE_MISMATCH);
    }

    /** 삭제·숨김 커뮤니티 글이 상세에서 제외되는지 검증한다. */
    @Test
    void hidesDeletedAndHiddenCommunityPostFromDetail() {
        Post deleted = communityPost(200L, MEETING_ID, 5L, "삭제된 글");
        ReflectionTestUtils.setField(deleted, "deletedAt", LocalDateTime.of(2026, 7, 29, 9, 0));
        Post hidden = communityPost(201L, MEETING_ID, 5L, "숨김 글");
        ReflectionTestUtils.setField(hidden, "status", PostStatus.HIDDEN);
        when(postRepository.findDetailById(200L)).thenReturn(Optional.of(deleted));
        when(postRepository.findDetailById(201L)).thenReturn(Optional.of(hidden));

        assertThat(errorCodeOf(() -> queryService.getCommunityPost(200L, null)))
                .isEqualTo(ErrorCode.POST_NOT_FOUND);
        assertThat(errorCodeOf(() -> queryService.getCommunityPost(201L, null)))
                .isEqualTo(ErrorCode.POST_NOT_FOUND);
    }

    /** 존재하지 않는 커뮤니티 글 조회가 404 오류를 반환하는지 검증한다. */
    @Test
    void rejectsMissingCommunityPost() {
        when(postRepository.findDetailById(999L)).thenReturn(Optional.empty());

        assertThat(errorCodeOf(() -> queryService.getCommunityPost(999L, null)))
                .isEqualTo(ErrorCode.POST_NOT_FOUND);
    }

    /** 식별자·팬미팅·작성자를 지정한 커뮤니티 게시글을 생성한다. */
    private Post communityPost(Long postId, Long meetingId, Long authorId, String title) {
        Post post = Post.createCommunity(
                user(authorId, UserRole.SOLO_INFLUENCER), meeting(meetingId), title, "본문"
        );
        ReflectionTestUtils.setField(post, "id", postId);
        ReflectionTestUtils.setField(post, "createdAt", LocalDateTime.of(2026, 7, 30, 10, 0));
        ReflectionTestUtils.setField(post, "updatedAt", LocalDateTime.of(2026, 7, 30, 10, 0));
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
