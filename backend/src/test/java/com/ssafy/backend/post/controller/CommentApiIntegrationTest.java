package com.ssafy.backend.post.controller;

import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.application.domain.ApplicationStatus;
import com.ssafy.backend.auth.jwt.JwtTokenProvider;
import com.ssafy.backend.auth.jwt.RevokedAccessTokenStore;
import com.ssafy.backend.auth.jwt.TokenSessionStore;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.post.domain.CommentReport;
import com.ssafy.backend.post.domain.Post;
import com.ssafy.backend.post.domain.PostComment;
import com.ssafy.backend.post.domain.PostStatus;
import com.ssafy.backend.post.domain.PostType;
import com.ssafy.backend.post.dto.CommentCreateRequest;
import com.ssafy.backend.post.repository.CommentReportRepository;
import com.ssafy.backend.post.repository.PostCommentRepository;
import com.ssafy.backend.post.repository.PostRepository;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 실제 DB(H2)와 실제 발급 JWT로 댓글 조회·작성과 댓글 신고 API의 HTTP 응답과 저장 결과를 검증한다.
 *
 * <p>Redis에 의존하는 토큰 폐기·세션 저장소만 대체하고 Security 필터부터 저장소까지는 실제 빈을 사용한다.
 * 커뮤니티 게시글 작성 API(POST-003b)는 이번 범위가 아니므로 게시글 행을 직접 준비한다.
 */
@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:comment-api;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "spring.sql.init.mode=never",
        "livekit.url=wss://test.livekit.invalid",
        "livekit.api-key=test-api-key",
        "livekit.api-secret=test-api-secret",
        "jwt.secret=0123456789abcdef0123456789abcdef"
})
@AutoConfigureMockMvc
@Transactional
class CommentApiIntegrationTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 7, 31, 15, 0);

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private FanMeetingRepository fanMeetingRepository;

    @Autowired
    private PostRepository postRepository;

    @Autowired
    private PostCommentRepository postCommentRepository;

    @Autowired
    private CommentReportRepository commentReportRepository;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @MockitoBean
    private RevokedAccessTokenStore revokedAccessTokenStore;

    @MockitoBean
    private TokenSessionStore tokenSessionStore;

    private User operator;
    private User participantFan;
    private User outsiderFan;
    private FanMeeting meeting;
    private Post communityPost;

    /** 참가 팬 한 명이 확정된 팬미팅과 커뮤니티 게시글을 준비한다. */
    @BeforeEach
    void setUp() {
        when(revokedAccessTokenStore.isRevoked(anyString())).thenReturn(false);
        when(tokenSessionStore.isCurrentAccessToken(anyLong(), anyString())).thenReturn(true);

        operator = persistUser("comment-solo", UserRole.SOLO_INFLUENCER);
        participantFan = persistUser("comment-fan", UserRole.FAN);
        outsiderFan = persistUser("comment-outsider", UserRole.FAN);
        meeting = fanMeetingRepository.saveAndFlush(FanMeeting.create(
                null, null, operator, "댓글 통합 테스트 팬미팅", "설명", null,
                LocalDateTime.of(2026, 8, 1, 19, 0)
        ));
        persistParticipant(meeting, participantFan);
        communityPost = persistCommunityPost(meeting, operator, "커뮤니티 글");
        entityManager.flush();
        entityManager.clear();
    }

    /** 확정 참가자의 댓글이 저장되고 목록에 즉시 나타나며 상위 댓글 없이 남는지 검증한다. */
    @Test
    void createsCommentAndExposesItThroughList() throws Exception {
        MvcResult created = mockMvc.perform(post(commentsPath(communityPost))
                        .header("Authorization", bearer(participantFan))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(commentBody("첫 댓글입니다")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.authorId").value(participantFan.getId()))
                .andExpect(jsonPath("$.data.authorNickname").value(participantFan.getNickname()))
                .andExpect(jsonPath("$.data.content").value("첫 댓글입니다"))
                .andExpect(jsonPath("$.data.createdAt").exists())
                .andReturn();
        long commentId = idOf(created, "commentId");

        PostComment saved = postCommentRepository.findById(commentId).orElseThrow();
        assertThat(saved.getParentComment()).isNull();
        assertThat(saved.getStatus()).isEqualTo(PostComment.STATUS_ACTIVE);
        assertThat(saved.getDeletedAt()).isNull();
        assertThat(saved.getPost().getId()).isEqualTo(communityPost.getId());
        assertThat(saved.getAuthor().getId()).isEqualTo(participantFan.getId());

        mockMvc.perform(get(commentsPath(communityPost)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].commentId").value(commentId))
                .andExpect(jsonPath("$.data.content[0].authorNickname")
                        .value(participantFan.getNickname()))
                .andExpect(jsonPath("$.data.content[0].updatedAt").exists())
                .andExpect(jsonPath("$.data.content[0].canEdit").value(false))
                .andExpect(jsonPath("$.data.content[0].canDelete").value(false));
    }

    /** 참가자가 아니어도 해당 팬미팅 운영자는 댓글을 작성할 수 있는지 검증한다. */
    @Test
    void allowsMeetingOperatorToComment() throws Exception {
        mockMvc.perform(post(commentsPath(communityPost))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(commentBody("운영자 안내")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.authorId").value(operator.getId()));

        assertThat(postCommentRepository.count()).isEqualTo(1);
    }

    /** 해당 팬미팅에 참가하지 않은 팬의 댓글 작성이 HTTP 403으로 거부되는지 검증한다. */
    @Test
    void rejectsNonParticipantFanWithForbidden() throws Exception {
        mockMvc.perform(post(commentsPath(communityPost))
                        .header("Authorization", bearer(outsiderFan))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(commentBody("참가하지 않은 팬 댓글")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("COMMENT_WRITE_NOT_ALLOWED"));

        assertThat(postCommentRepository.count()).isZero();
    }

    /** 인증 없이 댓글을 작성하면 HTTP 401을 받는지 검증한다. */
    @Test
    void rejectsUnauthenticatedCommentCreation() throws Exception {
        mockMvc.perform(post(commentsPath(communityPost))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(commentBody("비로그인 댓글")))
                .andExpect(status().isUnauthorized());

        assertThat(postCommentRepository.count()).isZero();
    }

    /** 공지 게시글에는 댓글을 작성하거나 목록을 조회할 수 없는지 검증한다. */
    @Test
    void rejectsCommentOnNoticePost() throws Exception {
        Post notice = postRepository.saveAndFlush(Post.createNotice(
                operator, meeting, PostType.MEETING_NOTICE, "공지", "본문"
        ));
        entityManager.clear();

        mockMvc.perform(post(commentsPath(notice))
                        .header("Authorization", bearer(participantFan))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(commentBody("공지 댓글")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("POST_TYPE_MISMATCH"));

        mockMvc.perform(get(commentsPath(notice)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("POST_TYPE_MISMATCH"));

        assertThat(postCommentRepository.count()).isZero();
    }

    /** 삭제·숨김 게시글의 댓글 작성과 목록 조회가 HTTP 404가 되는지 검증한다. */
    @Test
    void rejectsCommentOnDeletedOrHiddenPost() throws Exception {
        Post deleted = persistCommunityPost(meeting, operator, "삭제된 커뮤니티 글");
        ReflectionTestUtils.setField(deleted, "deletedAt", NOW);
        Post hidden = persistCommunityPost(meeting, operator, "숨김 커뮤니티 글");
        ReflectionTestUtils.setField(hidden, "status", PostStatus.HIDDEN);
        postRepository.flush();
        entityManager.clear();

        for (Post post : List.of(deleted, hidden)) {
            mockMvc.perform(get(commentsPath(post)))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("POST_NOT_FOUND"));
            mockMvc.perform(post(commentsPath(post))
                            .header("Authorization", bearer(participantFan))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(commentBody("댓글")))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("POST_NOT_FOUND"));
        }
    }

    /** 존재하지 않는 게시글의 댓글 목록 조회가 HTTP 404가 되는지 검증한다. */
    @Test
    void returnsNotFoundForMissingPost() throws Exception {
        long missingId = communityPost.getId() + 9_999L;

        mockMvc.perform(get("/api/v1/community/posts/" + missingId + "/comments"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("POST_NOT_FOUND"));
    }

    /** 삭제·숨김 댓글이 목록에서 제외되는지 검증한다. */
    @Test
    void excludesDeletedAndHiddenCommentsFromList() throws Exception {
        PostComment deleted = persistComment(communityPost, participantFan, "삭제된 댓글");
        ReflectionTestUtils.setField(deleted, "deletedAt", NOW);
        PostComment hidden = persistComment(communityPost, participantFan, "숨김 댓글");
        ReflectionTestUtils.setField(hidden, "status", PostComment.STATUS_HIDDEN);
        PostComment visible = persistComment(communityPost, participantFan, "노출 댓글");
        postCommentRepository.flush();
        entityManager.clear();

        mockMvc.perform(get(commentsPath(communityPost)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].commentId").value(visible.getId()))
                .andExpect(jsonPath("$.data.content[0].content").value("노출 댓글"));
    }

    /** 댓글이 없는 게시글이 빈 목록을 반환하는지 검증한다. */
    @Test
    void returnsEmptyListForPostWithoutComment() throws Exception {
        mockMvc.perform(get(commentsPath(communityPost)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isEmpty())
                .andExpect(jsonPath("$.data.totalElements").value(0))
                .andExpect(jsonPath("$.data.totalPages").value(0))
                .andExpect(jsonPath("$.data.hasNext").value(false));
    }

    /** 조회자별 수정·삭제 가능 여부가 명세대로 계산되는지 검증한다. */
    @Test
    void computesCanEditAndCanDeleteByViewer() throws Exception {
        persistComment(communityPost, participantFan, "팬 댓글");
        postCommentRepository.flush();
        entityManager.clear();

        mockMvc.perform(get(commentsPath(communityPost))
                        .header("Authorization", bearer(participantFan)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].canEdit").value(true))
                .andExpect(jsonPath("$.data.content[0].canDelete").value(true));

        mockMvc.perform(get(commentsPath(communityPost))
                        .header("Authorization", bearer(operator)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].canEdit").value(false))
                .andExpect(jsonPath("$.data.content[0].canDelete").value(true));

        mockMvc.perform(get(commentsPath(communityPost))
                        .header("Authorization", bearer(outsiderFan)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].canEdit").value(false))
                .andExpect(jsonPath("$.data.content[0].canDelete").value(false));
    }

    /** 댓글이 작성순으로 정렬되는지 검증한다. */
    @Test
    void sortsCommentsByCreatedAtAscending() throws Exception {
        PostComment first = persistComment(communityPost, participantFan, "첫 댓글");
        PostComment second = persistComment(communityPost, operator, "두 번째 댓글");
        postCommentRepository.flush();
        entityManager.clear();

        mockMvc.perform(get(commentsPath(communityPost)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].commentId").value(first.getId()))
                .andExpect(jsonPath("$.data.content[1].commentId").value(second.getId()));
    }

    /** 페이지 크기 경계값 1·100은 허용되고 101과 음수 페이지는 거부되는지 검증한다. */
    @Test
    void validatesPageBoundaries() throws Exception {
        persistComment(communityPost, participantFan, "댓글 1");
        persistComment(communityPost, participantFan, "댓글 2");
        postCommentRepository.flush();
        entityManager.clear();

        mockMvc.perform(get(commentsPath(communityPost)).param("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.size").value(1))
                .andExpect(jsonPath("$.data.totalPages").value(2))
                .andExpect(jsonPath("$.data.hasNext").value(true));
        mockMvc.perform(get(commentsPath(communityPost)).param("size", "100"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.size").value(100));
        mockMvc.perform(get(commentsPath(communityPost)).param("size", "101"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        mockMvc.perform(get(commentsPath(communityPost)).param("page", "-1"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        mockMvc.perform(get(commentsPath(communityPost)).param("page", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isEmpty())
                .andExpect(jsonPath("$.data.totalElements").value(2));
    }

    /** 최대 길이 댓글은 저장되고 한 글자 초과하거나 빈 본문이면 거부되는지 검증한다. */
    @Test
    void validatesCommentContentLength() throws Exception {
        String maxContent = "가".repeat(CommentCreateRequest.CONTENT_MAX_LENGTH);

        mockMvc.perform(post(commentsPath(communityPost))
                        .header("Authorization", bearer(participantFan))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(commentBody(maxContent)))
                .andExpect(status().isCreated());

        mockMvc.perform(post(commentsPath(communityPost))
                        .header("Authorization", bearer(participantFan))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(commentBody(maxContent + "가")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        mockMvc.perform(post(commentsPath(communityPost))
                        .header("Authorization", bearer(participantFan))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(commentBody("   ")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        assertThat(postCommentRepository.count()).isEqualTo(1);
    }

    /** 댓글 신고가 접수 상태로 저장되고 같은 사용자의 재신고가 HTTP 409로 막히는지 검증한다. */
    @Test
    void reportsCommentOnceAndRejectsDuplicate() throws Exception {
        PostComment comment = persistComment(communityPost, participantFan, "신고 대상 댓글");
        postCommentRepository.flush();
        entityManager.clear();

        MvcResult created = mockMvc.perform(post(reportsPath(comment))
                        .header("Authorization", bearer(outsiderFan))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reportBody("욕설", "심한 표현이 있습니다")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.commentId").value(comment.getId()))
                .andExpect(jsonPath("$.data.reportStatus").value(CommentReport.STATUS_RECEIVED))
                .andExpect(jsonPath("$.data.reportedAt").exists())
                .andReturn();
        long reportId = idOf(created, "reportId");

        CommentReport saved = commentReportRepository.findById(reportId).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo(CommentReport.STATUS_RECEIVED);
        assertThat(saved.getReason()).isEqualTo("욕설");
        assertThat(saved.getDetail()).isEqualTo("심한 표현이 있습니다");
        assertThat(saved.getReporter().getId()).isEqualTo(outsiderFan.getId());
        assertThat(saved.getComment().getId()).isEqualTo(comment.getId());
        assertThat(saved.getReportedAt()).isNotNull();
        assertThat(saved.getProcessedBy()).isNull();
        assertThat(saved.getProcessedAt()).isNull();

        mockMvc.perform(post(reportsPath(comment))
                        .header("Authorization", bearer(outsiderFan))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reportBody("욕설", null)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("COMMENT_REPORT_ALREADY_EXISTS"));

        assertThat(commentReportRepository.count()).isEqualTo(1);
    }

    /** 다른 사용자는 같은 댓글을 각각 신고할 수 있는지 검증한다. */
    @Test
    void allowsDifferentReportersOnSameComment() throws Exception {
        PostComment comment = persistComment(communityPost, participantFan, "신고 대상 댓글");
        postCommentRepository.flush();
        entityManager.clear();

        mockMvc.perform(post(reportsPath(comment))
                        .header("Authorization", bearer(outsiderFan))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reportBody("욕설", null)))
                .andExpect(status().isCreated());
        mockMvc.perform(post(reportsPath(comment))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reportBody("광고", null)))
                .andExpect(status().isCreated());

        assertThat(commentReportRepository.count()).isEqualTo(2);
    }

    /** 본인 댓글 신고가 HTTP 400으로 거부되는지 검증한다. */
    @Test
    void rejectsSelfCommentReport() throws Exception {
        PostComment comment = persistComment(communityPost, participantFan, "내 댓글");
        postCommentRepository.flush();
        entityManager.clear();

        mockMvc.perform(post(reportsPath(comment))
                        .header("Authorization", bearer(participantFan))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reportBody("욕설", null)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("SELF_COMMENT_REPORT_NOT_ALLOWED"));

        assertThat(commentReportRepository.count()).isZero();
    }

    /** 삭제·숨김 댓글과 존재하지 않는 댓글 신고가 HTTP 404가 되는지 검증한다. */
    @Test
    void rejectsReportOnMissingOrInvisibleComment() throws Exception {
        PostComment deleted = persistComment(communityPost, participantFan, "삭제된 댓글");
        ReflectionTestUtils.setField(deleted, "deletedAt", NOW);
        PostComment hidden = persistComment(communityPost, participantFan, "숨김 댓글");
        ReflectionTestUtils.setField(hidden, "status", PostComment.STATUS_HIDDEN);
        postCommentRepository.flush();
        long missingId = hidden.getId() + 9_999L;
        entityManager.clear();

        for (long commentId : List.of(deleted.getId(), hidden.getId(), missingId)) {
            mockMvc.perform(post("/api/v1/comments/" + commentId + "/reports")
                            .header("Authorization", bearer(outsiderFan))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(reportBody("욕설", null)))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("COMMENT_NOT_FOUND"));
        }

        assertThat(commentReportRepository.count()).isZero();
    }

    /** 인증 없이 댓글을 신고하면 HTTP 401을 받는지 검증한다. */
    @Test
    void rejectsUnauthenticatedCommentReport() throws Exception {
        PostComment comment = persistComment(communityPost, participantFan, "신고 대상 댓글");
        postCommentRepository.flush();
        entityManager.clear();

        mockMvc.perform(post(reportsPath(comment))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reportBody("욕설", null)))
                .andExpect(status().isUnauthorized());

        assertThat(commentReportRepository.count()).isZero();
    }

    /** 작성자가 서로 다른 댓글이 늘어나도 목록 조회 SQL 수가 늘어나지 않는지 실행 통계로 검증한다. */
    @Test
    void queriesCommentListWithoutNPlusOne() throws Exception {
        // 작성자를 모두 다르게 만들어 fetch join이 빠지면 작성자 수만큼 조회가 늘어나도록 한다.
        persistComment(communityPost, persistUser("comment-author-1", UserRole.FAN), "댓글 1");
        long singleAuthorQueries = countQueriesForCommentList(1);

        for (int index = 2; index <= 5; index++) {
            persistComment(communityPost, persistUser("comment-author-" + index, UserRole.FAN),
                    "댓글 " + index);
        }
        long fiveAuthorQueries = countQueriesForCommentList(5);

        // 작성자가 1명일 때와 5명일 때 실행 쿼리 수가 같아야 작성자별 추가 조회가 없다.
        assertThat(fiveAuthorQueries).isEqualTo(singleAuthorQueries);
    }

    /**
     * 댓글 목록을 한 번 조회하며 실행된 JDBC 문장 수를 센다.
     *
     * @param expectedTotalElements 조회 결과에 담겨야 하는 전체 댓글 수
     * @return 목록 조회 한 번에 실행된 JDBC 문장 수
     */
    private long countQueriesForCommentList(int expectedTotalElements) throws Exception {
        postCommentRepository.flush();
        entityManager.clear();
        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.clear();

        mockMvc.perform(get(commentsPath(communityPost)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(expectedTotalElements));

        return statistics.getPrepareStatementCount();
    }

    /** 댓글 목록 API 경로를 만든다. */
    private String commentsPath(Post post) {
        return "/api/v1/community/posts/" + post.getId() + "/comments";
    }

    /** 댓글 신고 API 경로를 만든다. */
    private String reportsPath(PostComment comment) {
        return "/api/v1/comments/" + comment.getId() + "/reports";
    }

    /** 실제 발급한 Access Token으로 Authorization 헤더 값을 만든다. */
    private String bearer(User user) {
        return "Bearer " + jwtTokenProvider.issue(user).accessToken();
    }

    /** 댓글 작성 요청 본문 JSON을 만든다. */
    private String commentBody(String content) {
        return "{\"content\":\"" + content + "\"}";
    }

    /**
     * 댓글 신고 요청 본문 JSON을 만든다.
     *
     * @param reason 신고 사유
     * @param detail 상세 설명이며 없으면 null
     * @return 신고 요청 본문 JSON
     */
    private String reportBody(String reason, String detail) {
        if (detail == null) {
            return "{\"reason\":\"" + reason + "\"}";
        }
        return "{\"reason\":\"" + reason + "\",\"detail\":\"" + detail + "\"}";
    }

    /**
     * 생성 응답에서 지정한 식별자 값을 꺼낸다.
     *
     * @param result 생성 응답
     * @param field 읽을 식별자 필드 이름
     * @return 응답에 담긴 식별자
     */
    private long idOf(MvcResult result, String field) throws Exception {
        String body = result.getResponse().getContentAsString();
        String marker = "\"" + field + "\":";
        int start = body.indexOf(marker) + marker.length();
        int end = body.indexOf(',', start);
        return Long.parseLong(body.substring(start, end).trim());
    }

    /** 통합 테스트에 사용할 활성 사용자를 저장한다. */
    private User persistUser(String loginId, UserRole role) {
        return userRepository.saveAndFlush(User.createActive(
                loginId, loginId + "@example.com", "encoded-password",
                loginId + "-닉네임", role, PreferredLanguage.KOREAN
        ));
    }

    /**
     * 응모 당첨 이력과 함께 팬미팅의 확정 참가자를 저장한다.
     *
     * @param meeting 대상 팬미팅
     * @param fan 참가자로 확정할 팬
     */
    private void persistParticipant(FanMeeting meeting, User fan) {
        Application application = BeanUtils.instantiateClass(Application.class);
        ReflectionTestUtils.setField(application, "meeting", meeting);
        ReflectionTestUtils.setField(application, "fan", fan);
        ReflectionTestUtils.setField(application, "status", ApplicationStatus.SELECTED);
        ReflectionTestUtils.setField(application, "personalInformationConsentAt", NOW);
        ReflectionTestUtils.setField(application, "submittedAt", NOW);
        entityManager.persist(application);

        Participant participant = BeanUtils.instantiateClass(Participant.class);
        ReflectionTestUtils.setField(participant, "meeting", meeting);
        ReflectionTestUtils.setField(participant, "fan", fan);
        ReflectionTestUtils.setField(participant, "application", application);
        ReflectionTestUtils.setField(participant, "status", "READY");
        ReflectionTestUtils.setField(participant, "assignedOrder", 1);
        entityManager.persist(participant);
    }

    /**
     * 커뮤니티 게시글 작성 API(POST-003b)가 아직 없으므로 공개 상태 게시글 행을 직접 만든다.
     *
     * @param meeting 게시글이 속한 팬미팅
     * @param author 작성자
     * @param title 게시글 제목
     * @return 저장된 커뮤니티 게시글
     */
    private Post persistCommunityPost(FanMeeting meeting, User author, String title) {
        Post post = BeanUtils.instantiateClass(Post.class);
        ReflectionTestUtils.setField(post, "author", author);
        ReflectionTestUtils.setField(post, "meeting", meeting);
        ReflectionTestUtils.setField(post, "type", PostType.COMMUNITY);
        ReflectionTestUtils.setField(post, "title", title);
        ReflectionTestUtils.setField(post, "content", "커뮤니티 본문");
        ReflectionTestUtils.setField(post, "status", PostStatus.PUBLISHED);
        ReflectionTestUtils.setField(post, "pinned", false);
        ReflectionTestUtils.setField(post, "viewCount", 0L);
        return postRepository.saveAndFlush(post);
    }

    /**
     * 테스트에 사용할 댓글을 저장한다.
     *
     * @param post 댓글을 달 게시글
     * @param author 작성자
     * @param content 댓글 본문
     * @return 저장된 댓글
     */
    private PostComment persistComment(Post post, User author, String content) {
        return postCommentRepository.save(PostComment.createComment(post, author, content));
    }
}
