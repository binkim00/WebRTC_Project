package com.ssafy.backend.post.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.post.domain.CommentReport;
import com.ssafy.backend.post.domain.Post;
import com.ssafy.backend.post.domain.PostComment;
import com.ssafy.backend.post.domain.PostType;
import com.ssafy.backend.post.dto.CommentReportCreateRequest;
import com.ssafy.backend.post.dto.CommentReportCreateResponse;
import com.ssafy.backend.post.repository.CommentReportRepository;
import com.ssafy.backend.post.repository.PostCommentRepository;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class CommentReportServiceTest {

    private static final AuthenticatedUser REPORTER_PRINCIPAL =
            new AuthenticatedUser(1L, UserRole.FAN);
    private static final long COMMENT_ID = 200L;
    private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 7, 31, 14, 30);

    private CurrentUserService currentUserService;
    private PostCommentRepository postCommentRepository;
    private CommentReportRepository commentReportRepository;
    private CommentReportService reportService;

    /** 각 테스트마다 고정 시계와 mock 협력 객체로 신고 서비스를 새로 구성한다. */
    @BeforeEach
    void setUp() {
        currentUserService = mock(CurrentUserService.class);
        postCommentRepository = mock(PostCommentRepository.class);
        commentReportRepository = mock(CommentReportRepository.class);
        Clock fixedClock = Clock.fixed(NOW.atZone(ZONE).toInstant(), ZONE);
        reportService = new CommentReportService(
                currentUserService, postCommentRepository, commentReportRepository, fixedClock
        );
    }

    /** 다른 사용자의 댓글 신고가 RECEIVED 상태와 고정 시계 시각으로 저장되는지 검증한다. */
    @Test
    void savesReportAsReceivedWithClockTime() {
        User reporter = user(1L, UserRole.FAN);
        PostComment comment = comment(user(2L, UserRole.FAN));
        givenReporter(reporter);
        givenComment(comment);
        givenNoPreviousReport(reporter);
        givenSavedReport(300L);

        CommentReportCreateResponse response = reportService.reportComment(
                COMMENT_ID, new CommentReportCreateRequest("욕설", "심한 표현이 있습니다"),
                REPORTER_PRINCIPAL
        );

        ArgumentCaptor<CommentReport> captor = ArgumentCaptor.forClass(CommentReport.class);
        verify(commentReportRepository).save(captor.capture());
        CommentReport saved = captor.getValue();
        assertThat(saved.getStatus()).isEqualTo(CommentReport.STATUS_RECEIVED);
        assertThat(saved.getReportedAt()).isEqualTo(NOW);
        assertThat(saved.getComment()).isSameAs(comment);
        assertThat(saved.getReporter()).isSameAs(reporter);
        assertThat(saved.getReason()).isEqualTo("욕설");
        assertThat(saved.getDetail()).isEqualTo("심한 표현이 있습니다");
        assertThat(saved.getProcessedBy()).isNull();
        assertThat(saved.getProcessedAt()).isNull();
        assertThat(response.reportId()).isEqualTo(300L);
        assertThat(response.commentId()).isEqualTo(COMMENT_ID);
        assertThat(response.reportStatus()).isEqualTo(CommentReport.STATUS_RECEIVED);
        assertThat(response.reportedAt()).isEqualTo(NOW);
    }

    /** 상세 설명을 보내지 않으면 null로 저장되는지 검증한다. */
    @Test
    void savesNullDetailWhenDetailIsBlank() {
        User reporter = user(1L, UserRole.FAN);
        givenReporter(reporter);
        givenComment(comment(user(2L, UserRole.FAN)));
        givenNoPreviousReport(reporter);
        givenSavedReport(301L);

        reportService.reportComment(
                COMMENT_ID, new CommentReportCreateRequest("스팸", "   "), REPORTER_PRINCIPAL
        );

        ArgumentCaptor<CommentReport> captor = ArgumentCaptor.forClass(CommentReport.class);
        verify(commentReportRepository).save(captor.capture());
        assertThat(captor.getValue().getDetail()).isNull();
    }

    /** 신고 사유 앞뒤 공백이 제거된 상태로 저장되는지 검증한다. */
    @Test
    void trimsReasonBeforeSaving() {
        User reporter = user(1L, UserRole.FAN);
        givenReporter(reporter);
        givenComment(comment(user(2L, UserRole.FAN)));
        givenNoPreviousReport(reporter);
        givenSavedReport(302L);

        reportService.reportComment(
                COMMENT_ID, new CommentReportCreateRequest("  광고  ", null), REPORTER_PRINCIPAL
        );

        ArgumentCaptor<CommentReport> captor = ArgumentCaptor.forClass(CommentReport.class);
        verify(commentReportRepository).save(captor.capture());
        assertThat(captor.getValue().getReason()).isEqualTo("광고");
        assertThat(captor.getValue().getDetail()).isNull();
    }

    /** 본인 댓글 신고가 거부되는지 검증한다. */
    @Test
    void rejectsSelfReport() {
        User reporter = user(1L, UserRole.FAN);
        givenReporter(reporter);
        givenComment(comment(reporter));

        assertThatThrownBy(() -> reportService.reportComment(
                COMMENT_ID, new CommentReportCreateRequest("욕설", null), REPORTER_PRINCIPAL
        ))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.SELF_COMMENT_REPORT_NOT_ALLOWED);
        verify(commentReportRepository, never()).save(any(CommentReport.class));
    }

    /** 같은 사용자의 중복 신고가 거부되는지 검증한다. */
    @Test
    void rejectsDuplicatedReport() {
        User reporter = user(1L, UserRole.FAN);
        givenReporter(reporter);
        givenComment(comment(user(2L, UserRole.FAN)));
        when(commentReportRepository.existsByComment_IdAndReporter_Id(COMMENT_ID, 1L))
                .thenReturn(true);

        assertThatThrownBy(() -> reportService.reportComment(
                COMMENT_ID, new CommentReportCreateRequest("욕설", null), REPORTER_PRINCIPAL
        ))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.COMMENT_REPORT_ALREADY_EXISTS);
        verify(commentReportRepository, never()).save(any(CommentReport.class));
    }

    /** 존재하지 않는 댓글 신고가 거부되는지 검증한다. */
    @Test
    void rejectsReportOnMissingComment() {
        givenReporter(user(1L, UserRole.FAN));
        when(postCommentRepository.findDetailById(COMMENT_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> reportService.reportComment(
                COMMENT_ID, new CommentReportCreateRequest("욕설", null), REPORTER_PRINCIPAL
        ))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.COMMENT_NOT_FOUND);
        verify(commentReportRepository, never()).save(any(CommentReport.class));
    }

    /** 삭제된 댓글 신고가 거부되는지 검증한다. */
    @Test
    void rejectsReportOnDeletedComment() {
        givenReporter(user(1L, UserRole.FAN));
        PostComment comment = comment(user(2L, UserRole.FAN));
        ReflectionTestUtils.setField(comment, "deletedAt", LocalDateTime.of(2026, 7, 30, 9, 0));
        givenComment(comment);

        assertThatThrownBy(() -> reportService.reportComment(
                COMMENT_ID, new CommentReportCreateRequest("욕설", null), REPORTER_PRINCIPAL
        ))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.COMMENT_NOT_FOUND);
        verify(commentReportRepository, never()).save(any(CommentReport.class));
    }

    /** 이미 숨겨진 댓글 신고가 거부되는지 검증한다. */
    @Test
    void rejectsReportOnHiddenComment() {
        givenReporter(user(1L, UserRole.FAN));
        PostComment comment = comment(user(2L, UserRole.FAN));
        ReflectionTestUtils.setField(comment, "status", PostComment.STATUS_HIDDEN);
        givenComment(comment);

        assertThatThrownBy(() -> reportService.reportComment(
                COMMENT_ID, new CommentReportCreateRequest("욕설", null), REPORTER_PRINCIPAL
        ))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.COMMENT_NOT_FOUND);
        verify(commentReportRepository, never()).save(any(CommentReport.class));
    }

    /** 인증 정보가 없으면 댓글을 신고하지 못하는지 검증한다. */
    @Test
    void rejectsUnauthenticatedReporter() {
        when(currentUserService.requireActiveUser(null))
                .thenThrow(new BusinessException(ErrorCode.AUTHENTICATION_REQUIRED));

        assertThatThrownBy(() -> reportService.reportComment(
                COMMENT_ID, new CommentReportCreateRequest("욕설", null), null
        ))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.AUTHENTICATION_REQUIRED);
        verifyNoInteractions(postCommentRepository, commentReportRepository);
    }

    /** 현재 사용자 조회가 지정한 신고자를 반환하도록 설정한다. */
    private void givenReporter(User reporter) {
        when(currentUserService.requireActiveUser(REPORTER_PRINCIPAL)).thenReturn(reporter);
    }

    /** 댓글 조회가 지정한 댓글을 반환하도록 설정한다. */
    private void givenComment(PostComment comment) {
        when(postCommentRepository.findDetailById(COMMENT_ID)).thenReturn(Optional.of(comment));
    }

    /** 신고 이력이 없도록 설정한다. */
    private void givenNoPreviousReport(User reporter) {
        when(commentReportRepository.existsByComment_IdAndReporter_Id(COMMENT_ID, reporter.getId()))
                .thenReturn(false);
    }

    /** 신고 저장이 식별자를 채운 엔티티를 반환하도록 설정한다. */
    private void givenSavedReport(long reportId) {
        when(commentReportRepository.save(any(CommentReport.class))).thenAnswer(invocation -> {
            CommentReport saved = invocation.getArgument(0);
            ReflectionTestUtils.setField(saved, "id", reportId);
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

    /**
     * 지정한 작성자의 저장된 댓글을 생성한다.
     *
     * @param author 댓글 작성자
     * @return 식별자가 채워진 공개 상태 댓글
     */
    private PostComment comment(User author) {
        PostComment comment = PostComment.createComment(communityPost(), author, "신고 대상 댓글");
        ReflectionTestUtils.setField(comment, "id", COMMENT_ID);
        return comment;
    }

    /**
     * 커뮤니티 게시글 작성 API(POST-003b)가 아직 없으므로 공지를 만든 뒤 유형만 바꿔 사용한다.
     *
     * @return 공개 상태의 커뮤니티 게시글
     */
    private Post communityPost() {
        FanMeeting meeting = FanMeeting.create(
                null, null, user(2L, UserRole.SOLO_INFLUENCER), "팬미팅", "설명", null,
                LocalDateTime.of(2026, 8, 1, 19, 0)
        );
        ReflectionTestUtils.setField(meeting, "id", 10L);
        Post post = Post.createNotice(
                user(2L, UserRole.SOLO_INFLUENCER), meeting, PostType.MEETING_NOTICE, "커뮤니티 글", "본문"
        );
        ReflectionTestUtils.setField(post, "type", PostType.COMMUNITY);
        ReflectionTestUtils.setField(post, "id", 20L);
        return post;
    }
}
