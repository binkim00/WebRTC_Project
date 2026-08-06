package com.ssafy.backend.post.controller;

import com.ssafy.backend.auth.jwt.JwtTokenProvider;
import com.ssafy.backend.auth.jwt.RevokedAccessTokenStore;
import com.ssafy.backend.auth.jwt.TokenSessionStore;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.post.domain.Post;
import com.ssafy.backend.post.domain.PostComment;
import com.ssafy.backend.post.dto.CommentUpdateRequest;
import com.ssafy.backend.post.repository.PostCommentRepository;
import com.ssafy.backend.post.repository.PostRepository;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 실제 DB(H2)와 실제 발급 JWT로 댓글 수정·삭제 API를 통합 검증한다.
 *
 * <p>Redis에 의존하는 토큰 폐기·세션 저장소만 대체하고 Security 필터부터 저장소까지는 실제 빈을 사용한다.
 */
@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:comment-modify-api;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.sql.init.mode=never",
        "livekit.url=wss://test.livekit.invalid",
        "livekit.api-key=test-api-key",
        "livekit.api-secret=test-api-secret",
        "jwt.secret=0123456789abcdef0123456789abcdef"
})
@AutoConfigureMockMvc
@Transactional
class CommentModifyApiIntegrationTest {

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
    private EntityManager entityManager;

    @MockitoBean
    private RevokedAccessTokenStore revokedAccessTokenStore;

    @MockitoBean
    private TokenSessionStore tokenSessionStore;

    /** 실제 발급한 Access Token이 인증 필터를 통과하도록 Redis 기반 저장소 응답을 고정한다. */
    @BeforeEach
    void allowIssuedTokens() {
        when(revokedAccessTokenStore.isRevoked(anyString())).thenReturn(false);
        when(tokenSessionStore.isCurrentAccessToken(anyLong(), anyString())).thenReturn(true);
    }

    /** 작성자가 자신의 댓글 본문을 수정하고 목록에 반영되는지 검증한다. */
    @Test
    void updatesOwnCommentByAuthor() throws Exception {
        User operator = saveUser("comment-solo-a", UserRole.SOLO_INFLUENCER);
        User fan = saveUser("comment-fan-a", UserRole.FAN);
        FanMeeting meeting = saveMeeting(operator, "댓글 팬미팅 A");
        Post post = savePost(operator, meeting, "글", "본문");
        PostComment comment = saveComment(post, fan, "원래 댓글");
        entityManager.clear();

        mockMvc.perform(patch(commentPath(comment.getId()))
                        .header("Authorization", bearer(fan))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"  바뀐 댓글  \"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.commentId").value(comment.getId()))
                .andExpect(jsonPath("$.data.postId").value(post.getId()))
                .andExpect(jsonPath("$.data.content").value("바뀐 댓글"))
                .andExpect(jsonPath("$.data.updatedAt").exists());

        entityManager.flush();
        entityManager.clear();
        PostComment reloaded = postCommentRepository.findById(comment.getId()).orElseThrow();
        assertThat(reloaded.getContent()).isEqualTo("바뀐 댓글");
        assertThat(reloaded.getStatus()).isEqualTo(PostComment.STATUS_ACTIVE);
        assertThat(reloaded.getDeletedAt()).isNull();

        mockMvc.perform(get(commentsPath(post.getId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].content").value("바뀐 댓글"));
    }

    /** 작성자가 아닌 소유 운영자도 댓글 내용은 수정하지 못하는지 검증한다. */
    @Test
    void rejectsUpdateByNonAuthor() throws Exception {
        User operator = saveUser("comment-solo-b", UserRole.SOLO_INFLUENCER);
        User fan = saveUser("comment-fan-b", UserRole.FAN);
        FanMeeting meeting = saveMeeting(operator, "댓글 팬미팅 B");
        Post post = savePost(operator, meeting, "글", "본문");
        PostComment comment = saveComment(post, fan, "팬 댓글");
        entityManager.clear();

        mockMvc.perform(patch(commentPath(comment.getId()))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"남의 댓글 수정\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        entityManager.clear();
        assertThat(postCommentRepository.findById(comment.getId()).orElseThrow().getContent())
                .isEqualTo("팬 댓글");
    }

    /** 작성자 삭제가 논리 삭제로 처리되고 목록에서 제외되는지 검증한다. */
    @Test
    void softDeletesOwnCommentByAuthor() throws Exception {
        User operator = saveUser("comment-solo-c", UserRole.SOLO_INFLUENCER);
        User fan = saveUser("comment-fan-c", UserRole.FAN);
        FanMeeting meeting = saveMeeting(operator, "댓글 팬미팅 C");
        Post post = savePost(operator, meeting, "글", "본문");
        PostComment comment = saveComment(post, fan, "삭제할 댓글");
        entityManager.clear();

        mockMvc.perform(delete(commentPath(comment.getId()))
                        .header("Authorization", bearer(fan)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.commentId").value(comment.getId()))
                .andExpect(jsonPath("$.data.postId").value(post.getId()))
                .andExpect(jsonPath("$.data.status").value(PostComment.STATUS_ACTIVE))
                .andExpect(jsonPath("$.data.deletedAt").exists());

        entityManager.flush();
        entityManager.clear();
        PostComment reloaded = postCommentRepository.findById(comment.getId()).orElseThrow();
        assertThat(reloaded.getDeletedAt()).isNotNull();
        assertThat(reloaded.getStatus()).isEqualTo(PostComment.STATUS_ACTIVE);

        mockMvc.perform(get(commentsPath(post.getId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(0));
    }

    /** 작성자가 아닌 소유 운영자의 삭제가 숨김 처리로 반영되는지 검증한다. */
    @Test
    void hidesCommentWhenOwningOperatorDeletesOthersComment() throws Exception {
        User operator = saveUser("comment-solo-d", UserRole.SOLO_INFLUENCER);
        User fan = saveUser("comment-fan-d", UserRole.FAN);
        FanMeeting meeting = saveMeeting(operator, "댓글 팬미팅 D");
        Post post = savePost(operator, meeting, "글", "본문");
        PostComment comment = saveComment(post, fan, "신고된 댓글");
        entityManager.clear();

        mockMvc.perform(delete(commentPath(comment.getId()))
                        .header("Authorization", bearer(operator)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value(PostComment.STATUS_HIDDEN))
                .andExpect(jsonPath("$.data.deletedAt").doesNotExist());

        entityManager.flush();
        entityManager.clear();
        PostComment reloaded = postCommentRepository.findById(comment.getId()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(PostComment.STATUS_HIDDEN);
        assertThat(reloaded.getDeletedAt()).isNull();

        mockMvc.perform(get(commentsPath(post.getId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(0));
    }

    /** 관계없는 사용자의 댓글 삭제가 거부되는지 검증한다. */
    @Test
    void rejectsDeleteByUnrelatedUser() throws Exception {
        User operator = saveUser("comment-solo-e", UserRole.SOLO_INFLUENCER);
        User fan = saveUser("comment-fan-e", UserRole.FAN);
        User outsider = saveUser("comment-outsider-e", UserRole.FAN);
        FanMeeting meeting = saveMeeting(operator, "댓글 팬미팅 E");
        Post post = savePost(operator, meeting, "글", "본문");
        PostComment comment = saveComment(post, fan, "팬 댓글");
        entityManager.clear();

        mockMvc.perform(delete(commentPath(comment.getId()))
                        .header("Authorization", bearer(outsider)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        entityManager.clear();
        assertThat(postCommentRepository.findById(comment.getId()).orElseThrow().getDeletedAt())
                .isNull();
    }

    /** 다른 팬미팅 운영자의 댓글 삭제가 거부되는지 검증한다. */
    @Test
    void rejectsDeleteByOtherMeetingOperator() throws Exception {
        User operator = saveUser("comment-solo-f", UserRole.SOLO_INFLUENCER);
        User otherOperator = saveUser("comment-solo-f2", UserRole.SOLO_INFLUENCER);
        User fan = saveUser("comment-fan-f", UserRole.FAN);
        FanMeeting meeting = saveMeeting(operator, "댓글 팬미팅 F");
        saveMeeting(otherOperator, "댓글 팬미팅 F2");
        Post post = savePost(operator, meeting, "글", "본문");
        PostComment comment = saveComment(post, fan, "팬 댓글");
        entityManager.clear();

        mockMvc.perform(delete(commentPath(comment.getId()))
                        .header("Authorization", bearer(otherOperator)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
    }

    /** 이미 삭제·숨김된 댓글의 재삭제와 재수정이 404를 반환하는지 검증한다. */
    @Test
    void returnsNotFoundForDeletedOrHiddenComment() throws Exception {
        User operator = saveUser("comment-solo-g", UserRole.SOLO_INFLUENCER);
        User fan = saveUser("comment-fan-g", UserRole.FAN);
        FanMeeting meeting = saveMeeting(operator, "댓글 팬미팅 G");
        Post post = savePost(operator, meeting, "글", "본문");
        PostComment deleted = saveComment(post, fan, "삭제된 댓글");
        ReflectionTestUtils.setField(deleted, "deletedAt", LocalDateTime.of(2026, 7, 30, 9, 0));
        PostComment hidden = saveComment(post, fan, "숨김 댓글");
        ReflectionTestUtils.setField(hidden, "status", PostComment.STATUS_HIDDEN);
        postCommentRepository.flush();
        entityManager.clear();

        mockMvc.perform(delete(commentPath(deleted.getId()))
                        .header("Authorization", bearer(fan)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("COMMENT_NOT_FOUND"));
        mockMvc.perform(patch(commentPath(deleted.getId()))
                        .header("Authorization", bearer(fan))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"재수정\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("COMMENT_NOT_FOUND"));
        mockMvc.perform(delete(commentPath(hidden.getId()))
                        .header("Authorization", bearer(fan)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("COMMENT_NOT_FOUND"));
    }

    /** 빈 본문과 최대 길이 초과 요청이 거부되는지 검증한다. */
    @Test
    void validatesUpdateRequest() throws Exception {
        User operator = saveUser("comment-solo-h", UserRole.SOLO_INFLUENCER);
        User fan = saveUser("comment-fan-h", UserRole.FAN);
        FanMeeting meeting = saveMeeting(operator, "댓글 팬미팅 H");
        Post post = savePost(operator, meeting, "글", "본문");
        PostComment comment = saveComment(post, fan, "댓글");
        entityManager.clear();
        String maxContent = "가".repeat(CommentUpdateRequest.CONTENT_MAX_LENGTH);

        mockMvc.perform(patch(commentPath(comment.getId()))
                        .header("Authorization", bearer(fan))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"   \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        mockMvc.perform(patch(commentPath(comment.getId()))
                        .header("Authorization", bearer(fan))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        mockMvc.perform(patch(commentPath(comment.getId()))
                        .header("Authorization", bearer(fan))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"" + maxContent + "\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(patch(commentPath(comment.getId()))
                        .header("Authorization", bearer(fan))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"" + maxContent + "가\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    /** 인증 없이 댓글 수정·삭제를 호출하면 401을 반환하는지 검증한다. */
    @Test
    void rejectsUnauthenticatedCommands() throws Exception {
        User operator = saveUser("comment-solo-i", UserRole.SOLO_INFLUENCER);
        User fan = saveUser("comment-fan-i", UserRole.FAN);
        FanMeeting meeting = saveMeeting(operator, "댓글 팬미팅 I");
        Post post = savePost(operator, meeting, "글", "본문");
        PostComment comment = saveComment(post, fan, "댓글");
        entityManager.clear();

        mockMvc.perform(patch(commentPath(comment.getId()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"내용\"}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(delete(commentPath(comment.getId())))
                .andExpect(status().isUnauthorized());
    }

    /** 존재하지 않는 댓글 수정·삭제가 404를 반환하는지 검증한다. */
    @Test
    void returnsNotFoundForMissingComment() throws Exception {
        User fan = saveUser("comment-fan-j", UserRole.FAN);
        long missingId = 9_999L;

        mockMvc.perform(patch(commentPath(missingId))
                        .header("Authorization", bearer(fan))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"내용\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("COMMENT_NOT_FOUND"));
        mockMvc.perform(delete(commentPath(missingId))
                        .header("Authorization", bearer(fan)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("COMMENT_NOT_FOUND"));
    }

    /** 댓글 수정·삭제 API 경로를 만든다. */
    private String commentPath(long commentId) {
        return "/api/v1/comments/" + commentId;
    }

    /** 댓글 목록 API 경로를 만든다. */
    private String commentsPath(long postId) {
        return "/api/v1/community/posts/" + postId + "/comments";
    }

    /** 실제 발급한 Access Token으로 Authorization 헤더 값을 만든다. */
    private String bearer(User user) {
        return "Bearer " + jwtTokenProvider.issue(user).accessToken();
    }

    /** 통합 테스트에 사용할 활성 사용자를 저장한다. */
    private User saveUser(String loginId, UserRole role) {
        return userRepository.saveAndFlush(User.createActive(
                loginId, loginId + "@example.com", "encoded-password",
                loginId + "-닉네임", role, PreferredLanguage.KOREAN
        ));
    }

    /** 통합 테스트에 사용할 1인 인플루언서 팬미팅을 저장한다. */
    private FanMeeting saveMeeting(User influencer, String title) {
        return fanMeetingRepository.saveAndFlush(FanMeeting.create(
                null, null, influencer, title, "설명", null,
                LocalDateTime.of(2026, 8, 1, 19, 0)
        ));
    }

    /** 통합 테스트에 사용할 커뮤니티 게시글을 저장한다. */
    private Post savePost(User author, FanMeeting meeting, String title, String content) {
        return postRepository.saveAndFlush(Post.createCommunity(author, meeting, title, content));
    }

    /** 통합 테스트에 사용할 댓글을 저장한다. */
    private PostComment saveComment(Post post, User author, String content) {
        return postCommentRepository.saveAndFlush(
                PostComment.createComment(post, author, content));
    }
}
