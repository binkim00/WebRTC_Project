package com.ssafy.backend.post.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.organization.domain.Organization;
import com.ssafy.backend.organization.domain.OrganizationMemberStatus;
import com.ssafy.backend.organization.repository.OrganizationMemberRepository;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.post.domain.Post;
import com.ssafy.backend.post.domain.PostComment;
import com.ssafy.backend.post.domain.PostStatus;
import com.ssafy.backend.post.domain.PostType;
import com.ssafy.backend.post.dto.CommentCreateRequest;
import com.ssafy.backend.post.dto.CommentCreateResponse;
import com.ssafy.backend.post.dto.CommentSummaryResponse;
import com.ssafy.backend.post.repository.PostCommentRepository;
import com.ssafy.backend.post.repository.PostRepository;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.BeanUtils;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class CommentServiceTest {

    private static final AuthenticatedUser FAN_PRINCIPAL = new AuthenticatedUser(1L, UserRole.FAN);
    private static final AuthenticatedUser OPERATOR_PRINCIPAL =
            new AuthenticatedUser(2L, UserRole.SOLO_INFLUENCER);
    private static final long MEETING_ID = 10L;
    private static final long POST_ID = 20L;
    private static final long ORGANIZATION_ID = 30L;
    private static final LocalDateTime CREATED_AT = LocalDateTime.of(2026, 7, 30, 10, 0);

    private CurrentUserService currentUserService;
    private OrganizationMemberRepository organizationMemberRepository;
    private ParticipantRepository participantRepository;
    private PostRepository postRepository;
    private PostCommentRepository postCommentRepository;
    private CommentService commentService;

    /** 각 테스트마다 mock 협력 객체로 댓글 서비스를 새로 구성한다. */
    @BeforeEach
    void setUp() {
        currentUserService = mock(CurrentUserService.class);
        organizationMemberRepository = mock(OrganizationMemberRepository.class);
        participantRepository = mock(ParticipantRepository.class);
        postRepository = mock(PostRepository.class);
        postCommentRepository = mock(PostCommentRepository.class);
        commentService = new CommentService(currentUserService, organizationMemberRepository,
                participantRepository, postRepository, postCommentRepository);
    }

    /** 확정 참가자인 팬의 댓글이 상위 댓글 없이 공개 상태로 저장되는지 검증한다. */
    @Test
    void savesCommentWithoutParentForConfirmedParticipant() {
        User fan = user(1L, UserRole.FAN);
        Post post = communityPost(meeting());
        givenActiveFan(fan);
        givenPost(post);
        givenParticipant(fan);
        givenSavedComment(100L);

        CommentCreateResponse response = commentService.createComment(
                POST_ID, new CommentCreateRequest("좋은 팬미팅이었어요"), FAN_PRINCIPAL
        );

        ArgumentCaptor<PostComment> captor = ArgumentCaptor.forClass(PostComment.class);
        verify(postCommentRepository).save(captor.capture());
        PostComment saved = captor.getValue();
        assertThat(saved.getParentComment()).isNull();
        assertThat(saved.getStatus()).isEqualTo(PostComment.STATUS_ACTIVE);
        assertThat(saved.getDeletedAt()).isNull();
        assertThat(saved.getPost()).isSameAs(post);
        assertThat(saved.getAuthor()).isSameAs(fan);
        assertThat(response.commentId()).isEqualTo(100L);
        assertThat(response.authorId()).isEqualTo(1L);
        assertThat(response.authorNickname()).isEqualTo("사용자1");
        assertThat(response.content()).isEqualTo("좋은 팬미팅이었어요");
        assertThat(response.createdAt()).isEqualTo(CREATED_AT);
    }

    /** 참가자가 아니어도 해당 팬미팅을 주최한 1인 인플루언서는 댓글을 작성할 수 있는지 검증한다. */
    @Test
    void allowsHostingOperatorToComment() {
        User operator = user(2L, UserRole.SOLO_INFLUENCER);
        when(currentUserService.requireActiveUser(OPERATOR_PRINCIPAL)).thenReturn(operator);
        givenPost(communityPost(meeting()));
        when(participantRepository.findByMeeting_IdAndFan_Id(MEETING_ID, 2L))
                .thenReturn(Optional.empty());
        givenSavedComment(101L);

        CommentCreateResponse response = commentService.createComment(
                POST_ID, new CommentCreateRequest("운영자 안내입니다"), OPERATOR_PRINCIPAL
        );

        assertThat(response.commentId()).isEqualTo(101L);
        verify(postCommentRepository).save(any(PostComment.class));
        verifyNoInteractions(organizationMemberRepository);
    }

    /** 팬미팅을 주최한 조직의 활성 매니저도 댓글을 작성할 수 있는지 검증한다. */
    @Test
    void allowsActiveOrganizationMemberToComment() {
        User manager = user(3L, UserRole.MANAGER);
        AuthenticatedUser principal = new AuthenticatedUser(3L, UserRole.MANAGER);
        when(currentUserService.requireActiveUser(principal)).thenReturn(manager);
        givenPost(communityPost(organizationMeeting()));
        when(participantRepository.findByMeeting_IdAndFan_Id(MEETING_ID, 3L))
                .thenReturn(Optional.empty());
        when(organizationMemberRepository.existsByOrganization_IdAndUser_IdAndStatus(
                ORGANIZATION_ID, 3L, OrganizationMemberStatus.ACTIVE)).thenReturn(true);
        givenSavedComment(102L);

        CommentCreateResponse response = commentService.createComment(
                POST_ID, new CommentCreateRequest("조직 매니저 안내"), principal
        );

        assertThat(response.commentId()).isEqualTo(102L);
    }

    /** 참가자도 운영자도 아닌 로그인 사용자의 댓글 작성이 거부되는지 검증한다. */
    @Test
    void rejectsNonParticipantWriter() {
        User fan = user(1L, UserRole.FAN);
        givenActiveFan(fan);
        givenPost(communityPost(meeting()));
        when(participantRepository.findByMeeting_IdAndFan_Id(MEETING_ID, 1L))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> commentService.createComment(
                POST_ID, new CommentCreateRequest("댓글"), FAN_PRINCIPAL
        ))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.COMMENT_WRITE_NOT_ALLOWED);
        verify(postCommentRepository, never()).save(any(PostComment.class));
    }

    /** 다른 조직의 매니저는 댓글을 작성할 수 없는지 검증한다. */
    @Test
    void rejectsManagerOfAnotherOrganization() {
        User manager = user(4L, UserRole.MANAGER);
        AuthenticatedUser principal = new AuthenticatedUser(4L, UserRole.MANAGER);
        when(currentUserService.requireActiveUser(principal)).thenReturn(manager);
        givenPost(communityPost(organizationMeeting()));
        when(participantRepository.findByMeeting_IdAndFan_Id(MEETING_ID, 4L))
                .thenReturn(Optional.empty());
        when(organizationMemberRepository.existsByOrganization_IdAndUser_IdAndStatus(
                ORGANIZATION_ID, 4L, OrganizationMemberStatus.ACTIVE)).thenReturn(false);

        assertThatThrownBy(() -> commentService.createComment(
                POST_ID, new CommentCreateRequest("댓글"), principal
        ))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.COMMENT_WRITE_NOT_ALLOWED);
        verify(postCommentRepository, never()).save(any(PostComment.class));
    }

    /** 공지 게시글에는 댓글을 작성할 수 없는지 검증한다. */
    @Test
    void rejectsCommentOnNoticePost() {
        User fan = user(1L, UserRole.FAN);
        givenActiveFan(fan);
        givenPost(Post.createNotice(fan, meeting(), PostType.MEETING_NOTICE, "공지", "본문"));

        assertThatThrownBy(() -> commentService.createComment(
                POST_ID, new CommentCreateRequest("댓글"), FAN_PRINCIPAL
        ))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.POST_TYPE_MISMATCH);
        verify(postCommentRepository, never()).save(any(PostComment.class));
    }

    /** 존재하지 않는 게시글에는 댓글을 작성할 수 없는지 검증한다. */
    @Test
    void rejectsCommentOnMissingPost() {
        givenActiveFan(user(1L, UserRole.FAN));
        when(postRepository.findDetailById(POST_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> commentService.createComment(
                POST_ID, new CommentCreateRequest("댓글"), FAN_PRINCIPAL
        ))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.POST_NOT_FOUND);
        verify(postCommentRepository, never()).save(any(PostComment.class));
    }

    /** 삭제된 커뮤니티 게시글에는 댓글을 작성할 수 없는지 검증한다. */
    @Test
    void rejectsCommentOnDeletedPost() {
        givenActiveFan(user(1L, UserRole.FAN));
        Post post = communityPost(meeting());
        ReflectionTestUtils.setField(post, "deletedAt", LocalDateTime.of(2026, 7, 29, 9, 0));
        givenPost(post);

        assertThatThrownBy(() -> commentService.createComment(
                POST_ID, new CommentCreateRequest("댓글"), FAN_PRINCIPAL
        ))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.POST_NOT_FOUND);
        verify(postCommentRepository, never()).save(any(PostComment.class));
    }

    /** 숨김 처리된 커뮤니티 게시글에는 댓글을 작성할 수 없는지 검증한다. */
    @Test
    void rejectsCommentOnHiddenPost() {
        givenActiveFan(user(1L, UserRole.FAN));
        Post post = communityPost(meeting());
        ReflectionTestUtils.setField(post, "status", PostStatus.HIDDEN);
        givenPost(post);

        assertThatThrownBy(() -> commentService.createComment(
                POST_ID, new CommentCreateRequest("댓글"), FAN_PRINCIPAL
        ))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.POST_NOT_FOUND);
    }

    /** 팬미팅이 연결되지 않은 커뮤니티 게시글은 참가 자격을 확인할 수 없어 거부되는지 검증한다. */
    @Test
    void rejectsCommentWhenCommunityPostHasNoMeeting() {
        User fan = user(1L, UserRole.FAN);
        givenActiveFan(fan);
        givenPost(communityPost(null));

        assertThatThrownBy(() -> commentService.createComment(
                POST_ID, new CommentCreateRequest("댓글"), FAN_PRINCIPAL
        ))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.COMMENT_WRITE_NOT_ALLOWED);
        verifyNoInteractions(participantRepository, organizationMemberRepository);
        verify(postCommentRepository, never()).save(any(PostComment.class));
    }

    /** 댓글 본문 앞뒤 공백이 제거된 상태로 저장되는지 검증한다. */
    @Test
    void trimsContentBeforeSaving() {
        User fan = user(1L, UserRole.FAN);
        givenActiveFan(fan);
        givenPost(communityPost(meeting()));
        givenParticipant(fan);
        givenSavedComment(103L);

        commentService.createComment(POST_ID, new CommentCreateRequest("  댓글 본문  "), FAN_PRINCIPAL);

        ArgumentCaptor<PostComment> captor = ArgumentCaptor.forClass(PostComment.class);
        verify(postCommentRepository).save(captor.capture());
        assertThat(captor.getValue().getContent()).isEqualTo("댓글 본문");
    }

    /** 인증 정보가 없으면 댓글을 작성하지 못하는지 검증한다. */
    @Test
    void rejectsUnauthenticatedWriter() {
        when(currentUserService.requireActiveUser(null))
                .thenThrow(new BusinessException(ErrorCode.AUTHENTICATION_REQUIRED));

        assertThatThrownBy(() -> commentService.createComment(
                POST_ID, new CommentCreateRequest("댓글"), null
        ))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.AUTHENTICATION_REQUIRED);
        verifyNoInteractions(postRepository);
        verify(postCommentRepository, never()).save(any(PostComment.class));
    }

    /** 댓글 목록이 작성순 정렬로 요청되고 작성자 정보가 함께 응답되는지 검증한다. */
    @Test
    void returnsCommentsSortedByCreatedAtAscending() {
        User fan = user(1L, UserRole.FAN);
        Post post = communityPost(meeting());
        givenPost(post);
        PostComment comment = comment(200L, fan, post, "첫 댓글");
        when(postCommentRepository.findVisibleByPost(eq(POST_ID), any(Pageable.class)))
                .thenReturn(page(List.of(comment)));

        PageResponse<CommentSummaryResponse> response =
                commentService.getComments(POST_ID, 0, 20, null);

        ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);
        verify(postCommentRepository).findVisibleByPost(eq(POST_ID), captor.capture());
        assertThat(captor.getValue().getSort()).isEqualTo(Sort.by(
                Sort.Order.asc("createdAt"), Sort.Order.asc("id")
        ));
        assertThat(response.content()).hasSize(1);
        CommentSummaryResponse summary = response.content().get(0);
        assertThat(summary.commentId()).isEqualTo(200L);
        assertThat(summary.authorId()).isEqualTo(1L);
        assertThat(summary.authorNickname()).isEqualTo("사용자1");
        assertThat(summary.content()).isEqualTo("첫 댓글");
        assertThat(summary.createdAt()).isEqualTo(CREATED_AT);
        assertThat(summary.updatedAt()).isEqualTo(CREATED_AT);
    }

    /** 비로그인 조회는 수정·삭제 가능 여부가 모두 false인지 검증한다. */
    @Test
    void marksAnonymousViewerAsUnableToModify() {
        Post post = communityPost(meeting());
        givenPost(post);
        when(postCommentRepository.findVisibleByPost(eq(POST_ID), any(Pageable.class)))
                .thenReturn(page(List.of(comment(200L, user(1L, UserRole.FAN), post, "댓글"))));

        PageResponse<CommentSummaryResponse> response =
                commentService.getComments(POST_ID, 0, 20, null);

        assertThat(response.content().get(0).canEdit()).isFalse();
        assertThat(response.content().get(0).canDelete()).isFalse();
        verifyNoInteractions(currentUserService, organizationMemberRepository);
    }

    /** 작성자 본인은 수정과 삭제가 모두 가능한지 검증한다. */
    @Test
    void marksAuthorAsAbleToEditAndDelete() {
        User fan = user(1L, UserRole.FAN);
        Post post = communityPost(meeting());
        givenActiveFan(fan);
        givenPost(post);
        when(postCommentRepository.findVisibleByPost(eq(POST_ID), any(Pageable.class)))
                .thenReturn(page(List.of(comment(200L, fan, post, "내 댓글"))));

        PageResponse<CommentSummaryResponse> response =
                commentService.getComments(POST_ID, 0, 20, FAN_PRINCIPAL);

        assertThat(response.content().get(0).canEdit()).isTrue();
        assertThat(response.content().get(0).canDelete()).isTrue();
    }

    /** 해당 팬미팅 운영자는 남의 댓글을 삭제할 수 있으나 수정은 할 수 없는지 검증한다. */
    @Test
    void marksMeetingOperatorAsAbleToDeleteOnly() {
        User operator = user(2L, UserRole.SOLO_INFLUENCER);
        Post post = communityPost(meeting());
        when(currentUserService.requireActiveUser(OPERATOR_PRINCIPAL)).thenReturn(operator);
        givenPost(post);
        when(postCommentRepository.findVisibleByPost(eq(POST_ID), any(Pageable.class)))
                .thenReturn(page(List.of(comment(200L, user(1L, UserRole.FAN), post, "팬 댓글"))));

        PageResponse<CommentSummaryResponse> response =
                commentService.getComments(POST_ID, 0, 20, OPERATOR_PRINCIPAL);

        assertThat(response.content().get(0).canEdit()).isFalse();
        assertThat(response.content().get(0).canDelete()).isTrue();
    }

    /** 서비스 운영자는 남의 댓글을 삭제할 수 있는지 검증한다. */
    @Test
    void marksAdminAsAbleToDeleteOnly() {
        User admin = user(5L, UserRole.ADMIN);
        AuthenticatedUser principal = new AuthenticatedUser(5L, UserRole.ADMIN);
        Post post = communityPost(meeting());
        when(currentUserService.requireActiveUser(principal)).thenReturn(admin);
        givenPost(post);
        when(postCommentRepository.findVisibleByPost(eq(POST_ID), any(Pageable.class)))
                .thenReturn(page(List.of(comment(200L, user(1L, UserRole.FAN), post, "팬 댓글"))));

        PageResponse<CommentSummaryResponse> response =
                commentService.getComments(POST_ID, 0, 20, principal);

        assertThat(response.content().get(0).canEdit()).isFalse();
        assertThat(response.content().get(0).canDelete()).isTrue();
    }

    /** 참가자도 운영자도 아닌 로그인 사용자는 남의 댓글을 수정·삭제할 수 없는지 검증한다. */
    @Test
    void marksOtherViewerAsUnableToModify() {
        User viewer = user(4L, UserRole.FAN);
        AuthenticatedUser principal = new AuthenticatedUser(4L, UserRole.FAN);
        Post post = communityPost(meeting());
        when(currentUserService.requireActiveUser(principal)).thenReturn(viewer);
        givenPost(post);
        when(postCommentRepository.findVisibleByPost(eq(POST_ID), any(Pageable.class)))
                .thenReturn(page(List.of(comment(200L, user(1L, UserRole.FAN), post, "남의 댓글"))));

        PageResponse<CommentSummaryResponse> response =
                commentService.getComments(POST_ID, 0, 20, principal);

        assertThat(response.content().get(0).canEdit()).isFalse();
        assertThat(response.content().get(0).canDelete()).isFalse();
    }

    /** 댓글이 없는 게시글이 빈 목록을 반환하는지 검증한다. */
    @Test
    void returnsEmptyPageWhenPostHasNoComment() {
        givenPost(communityPost(meeting()));
        when(postCommentRepository.findVisibleByPost(eq(POST_ID), any(Pageable.class)))
                .thenReturn(page(List.of()));

        PageResponse<CommentSummaryResponse> response =
                commentService.getComments(POST_ID, 0, 20, null);

        assertThat(response.content()).isEmpty();
        assertThat(response.totalElements()).isZero();
        assertThat(response.hasNext()).isFalse();
    }

    /** 공지 게시글의 댓글 목록 조회가 거부되는지 검증한다. */
    @Test
    void rejectsCommentListOnNoticePost() {
        givenPost(Post.createNotice(
                user(2L, UserRole.MANAGER), meeting(), PostType.MEETING_NOTICE, "공지", "본문"
        ));

        assertThatThrownBy(() -> commentService.getComments(POST_ID, 0, 20, null))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.POST_TYPE_MISMATCH);
        verifyNoInteractions(postCommentRepository);
    }

    /** 삭제된 게시글의 댓글 목록 조회가 거부되는지 검증한다. */
    @Test
    void rejectsCommentListOnDeletedPost() {
        Post post = communityPost(meeting());
        ReflectionTestUtils.setField(post, "deletedAt", LocalDateTime.of(2026, 7, 29, 9, 0));
        givenPost(post);

        assertThatThrownBy(() -> commentService.getComments(POST_ID, 0, 20, null))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.POST_NOT_FOUND);
        verifyNoInteractions(postCommentRepository);
    }

    /** 존재하지 않는 게시글의 댓글 목록 조회가 거부되는지 검증한다. */
    @Test
    void rejectsCommentListOnMissingPost() {
        when(postRepository.findDetailById(POST_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> commentService.getComments(POST_ID, 0, 20, null))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.POST_NOT_FOUND);
        verifyNoInteractions(postCommentRepository);
    }

    /** 페이지 번호와 크기 경계값을 벗어난 목록 요청이 거부되는지 검증한다. */
    @Test
    void rejectsPageValuesOutOfRange() {
        assertThatThrownBy(() -> commentService.getComments(POST_ID, -1, 20, null))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_REQUEST);
        assertThatThrownBy(() -> commentService.getComments(POST_ID, 0, 0, null))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_REQUEST);
        assertThatThrownBy(() -> commentService.getComments(
                POST_ID, 0, CommentService.MAX_PAGE_SIZE + 1, null
        ))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_REQUEST);
        verifyNoInteractions(postRepository, postCommentRepository);
    }

    /** 현재 사용자 조회가 지정한 팬을 반환하도록 설정한다. */
    private void givenActiveFan(User fan) {
        when(currentUserService.requireActiveUser(FAN_PRINCIPAL)).thenReturn(fan);
    }

    /** 게시글 상세 조회가 지정한 게시글을 반환하도록 설정한다. */
    private void givenPost(Post post) {
        when(postRepository.findDetailById(POST_ID)).thenReturn(Optional.of(post));
    }

    /** 지정한 사용자가 해당 팬미팅의 확정 참가자로 조회되도록 설정한다. */
    private void givenParticipant(User fan) {
        when(participantRepository.findByMeeting_IdAndFan_Id(MEETING_ID, fan.getId()))
                .thenReturn(Optional.of(mock(Participant.class)));
    }

    /** 댓글 저장이 식별자와 작성 시각을 채운 엔티티를 반환하도록 설정한다. */
    private void givenSavedComment(long commentId) {
        when(postCommentRepository.save(any(PostComment.class))).thenAnswer(invocation -> {
            PostComment saved = invocation.getArgument(0);
            ReflectionTestUtils.setField(saved, "id", commentId);
            ReflectionTestUtils.setField(saved, "createdAt", CREATED_AT);
            ReflectionTestUtils.setField(saved, "updatedAt", CREATED_AT);
            return saved;
        });
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

    /** 조직 없이 1인 인플루언서가 주최한 팬미팅을 생성한다. */
    private FanMeeting meeting() {
        FanMeeting meeting = FanMeeting.create(
                null, null, user(2L, UserRole.SOLO_INFLUENCER), "팬미팅", "설명", null,
                LocalDateTime.of(2026, 8, 1, 19, 0)
        );
        ReflectionTestUtils.setField(meeting, "id", MEETING_ID);
        return meeting;
    }

    /** 조직이 주최한 팬미팅을 생성한다. */
    private FanMeeting organizationMeeting() {
        FanMeeting meeting = meeting();
        Organization organization = BeanUtils.instantiateClass(Organization.class);
        ReflectionTestUtils.setField(organization, "id", ORGANIZATION_ID);
        ReflectionTestUtils.setField(meeting, "organization", organization);
        return meeting;
    }

    /**
     * 커뮤니티 게시글 작성 API(POST-003b)가 아직 없으므로 공지를 만든 뒤 유형만 바꿔 사용한다.
     *
     * @param meeting 연결할 팬미팅이며 팬미팅이 없는 게시글은 null
     * @return 공개 상태의 커뮤니티 게시글
     */
    private Post communityPost(FanMeeting meeting) {
        Post post = Post.createNotice(
                user(2L, UserRole.SOLO_INFLUENCER),
                meeting == null ? meeting() : meeting,
                PostType.MEETING_NOTICE, "커뮤니티 글", "본문"
        );
        ReflectionTestUtils.setField(post, "type", PostType.COMMUNITY);
        ReflectionTestUtils.setField(post, "meeting", meeting);
        ReflectionTestUtils.setField(post, "id", POST_ID);
        return post;
    }

    /** 테스트에 사용할 저장된 댓글을 생성한다. */
    private PostComment comment(long commentId, User author, Post post, String content) {
        PostComment comment = PostComment.createComment(post, author, content);
        ReflectionTestUtils.setField(comment, "id", commentId);
        ReflectionTestUtils.setField(comment, "createdAt", CREATED_AT);
        ReflectionTestUtils.setField(comment, "updatedAt", CREATED_AT);
        return comment;
    }

    /** 지정한 댓글로 첫 페이지 결과를 만든다. */
    private Page<PostComment> page(List<PostComment> comments) {
        return new PageImpl<>(comments, PageRequest.of(0, 20), comments.size());
    }
}
