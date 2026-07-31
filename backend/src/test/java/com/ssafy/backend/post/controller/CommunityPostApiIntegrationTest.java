package com.ssafy.backend.post.controller;

import com.ssafy.backend.auth.jwt.JwtTokenProvider;
import com.ssafy.backend.auth.jwt.RevokedAccessTokenStore;
import com.ssafy.backend.auth.jwt.TokenSessionStore;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.post.domain.Post;
import com.ssafy.backend.post.domain.PostComment;
import com.ssafy.backend.post.domain.PostStatus;
import com.ssafy.backend.post.domain.PostType;
import com.ssafy.backend.post.dto.CommunityPostCreateRequest;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 실제 DB(H2)와 실제 발급 JWT로 커뮤니티 게시글 API의 HTTP 요청·응답과 저장 결과를 통합 검증한다.
 *
 * <p>Redis에 의존하는 토큰 폐기·세션 저장소만 대체하고 Security 필터부터 저장소까지는 실제 빈을 사용한다.
 */
@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:community-post-api;MODE=MySQL;DB_CLOSE_DELAY=-1",
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
class CommunityPostApiIntegrationTest {

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

    @Autowired
    private EntityManagerFactory entityManagerFactory;

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

    /** 운영자가 작성한 커뮤니티 글이 목록·상세에 나타나고 DB에 COMMUNITY·PUBLISHED로 저장되는지 검증한다. */
    @Test
    void createsCommunityPostAndExposesItThroughListAndDetail() throws Exception {
        User operator = saveUser("community-solo-a", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "커뮤니티 팬미팅 A");

        MvcResult created = mockMvc.perform(post(postsPath(meeting))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody("첫 커뮤니티 글", "커뮤니티 본문입니다")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.meetingId").value(meeting.getId()))
                .andExpect(jsonPath("$.data.title").value("첫 커뮤니티 글"))
                .andExpect(jsonPath("$.data.createdAt").exists())
                .andReturn();
        long postId = postIdOf(created);

        Post saved = postRepository.findById(postId).orElseThrow();
        assertThat(saved.getType()).isEqualTo(PostType.COMMUNITY);
        assertThat(saved.getStatus()).isEqualTo(PostStatus.PUBLISHED);
        assertThat(saved.getMeeting().getId()).isEqualTo(meeting.getId());
        assertThat(saved.getAuthor().getId()).isEqualTo(operator.getId());
        assertThat(saved.getDeletedAt()).isNull();

        mockMvc.perform(get(postsPath(meeting)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].postId").value(postId))
                .andExpect(jsonPath("$.data.content[0].meetingId").value(meeting.getId()))
                .andExpect(jsonPath("$.data.content[0].authorNickname").value(operator.getNickname()))
                .andExpect(jsonPath("$.data.content[0].thumbnailUrl").doesNotExist())
                .andExpect(jsonPath("$.data.content[0].pinned").value(false));

        mockMvc.perform(get(detailPath(postId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").value("커뮤니티 본문입니다"))
                .andExpect(jsonPath("$.data.attachments").isEmpty())
                .andExpect(jsonPath("$.data.commentCount").value(0))
                .andExpect(jsonPath("$.data.updatedAt").exists())
                .andExpect(jsonPath("$.data.canEdit").value(false))
                .andExpect(jsonPath("$.data.canDelete").value(false));

        mockMvc.perform(get(detailPath(postId)).header("Authorization", bearer(operator)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.canEdit").value(true))
                .andExpect(jsonPath("$.data.canDelete").value(true));
    }

    /** 상세의 댓글 수가 노출 가능한 댓글만 세는지 검증한다. */
    @Test
    void countsOnlyVisibleCommentsInDetail() throws Exception {
        User operator = saveUser("community-solo-b", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "커뮤니티 팬미팅 B");
        Post post = savePost(operator, meeting, "댓글 있는 글", "본문");
        postCommentRepository.save(PostComment.createComment(post, operator, "보이는 댓글 1"));
        postCommentRepository.save(PostComment.createComment(post, operator, "보이는 댓글 2"));
        PostComment deleted = postCommentRepository.save(
                PostComment.createComment(post, operator, "삭제된 댓글"));
        ReflectionTestUtils.setField(deleted, "deletedAt", LocalDateTime.of(2026, 7, 30, 9, 0));
        PostComment hidden = postCommentRepository.save(
                PostComment.createComment(post, operator, "숨김 댓글"));
        ReflectionTestUtils.setField(hidden, "status", PostComment.STATUS_HIDDEN);
        postCommentRepository.flush();
        entityManager.clear();

        mockMvc.perform(get(detailPath(post.getId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.commentCount").value(2));
    }

    /** 작성자가 제목만 보내도 본문은 유지되고 수정 결과가 저장되는지 검증한다. */
    @Test
    void updatesOnlyProvidedFieldByAuthor() throws Exception {
        User operator = saveUser("community-solo-c", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "커뮤니티 팬미팅 C");
        Post post = savePost(operator, meeting, "원래 제목", "원래 본문");
        entityManager.clear();

        mockMvc.perform(patch(detailPath(post.getId()))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"  바뀐 제목  \"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.postId").value(post.getId()))
                .andExpect(jsonPath("$.data.title").value("바뀐 제목"))
                .andExpect(jsonPath("$.data.content").value("원래 본문"))
                .andExpect(jsonPath("$.data.updatedAt").exists());

        entityManager.flush();
        entityManager.clear();
        Post reloaded = postRepository.findById(post.getId()).orElseThrow();
        assertThat(reloaded.getTitle()).isEqualTo("바뀐 제목");
        assertThat(reloaded.getContent()).isEqualTo("원래 본문");
        assertThat(reloaded.getStatus()).isEqualTo(PostStatus.PUBLISHED);
    }

    /** 작성자가 아닌 사용자는 글을 수정하지 못하는지 검증한다. */
    @Test
    void rejectsUpdateByNonAuthor() throws Exception {
        User author = saveUser("community-solo-d", UserRole.SOLO_INFLUENCER);
        User influencer = saveUser("community-influencer-d", UserRole.INFLUENCER);
        FanMeeting meeting = saveMeetingWithManager(influencer, author, "커뮤니티 팬미팅 D");
        Post post = savePost(author, meeting, "작성자 글", "본문");
        entityManager.clear();

        // 소유 운영자라도 다른 사람의 글 내용은 바꿀 수 없다.
        mockMvc.perform(patch(detailPath(post.getId()))
                        .header("Authorization", bearer(influencer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"남의 글 수정\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        entityManager.clear();
        assertThat(postRepository.findById(post.getId()).orElseThrow().getContent())
                .isEqualTo("본문");
    }

    /** 빈 본문과 수정할 항목이 없는 요청이 거부되는지 검증한다. */
    @Test
    void rejectsBlankAndEmptyUpdateRequest() throws Exception {
        User operator = saveUser("community-solo-e", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "커뮤니티 팬미팅 E");
        Post post = savePost(operator, meeting, "제목", "본문");
        entityManager.clear();

        mockMvc.perform(patch(detailPath(post.getId()))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"   \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        mockMvc.perform(patch(detailPath(post.getId()))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    /** 수정 요청의 최대 길이 경계값이 허용되고 한 글자 초과하면 거부되는지 검증한다. */
    @Test
    void validatesUpdateLengthBoundaries() throws Exception {
        User operator = saveUser("community-solo-f", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "커뮤니티 팬미팅 F");
        Post post = savePost(operator, meeting, "제목", "본문");
        entityManager.clear();
        String maxTitle = "가".repeat(CommunityPostCreateRequest.TITLE_MAX_LENGTH);

        mockMvc.perform(patch(detailPath(post.getId()))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"" + maxTitle + "\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(patch(detailPath(post.getId()))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"" + maxTitle + "가\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    /** 작성자 삭제가 논리 삭제로 처리되고 목록·상세에서 제외되는지 검증한다. */
    @Test
    void softDeletesPostByAuthorAndHidesItFromListAndDetail() throws Exception {
        User operator = saveUser("community-solo-g", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "커뮤니티 팬미팅 G");
        Post post = savePost(operator, meeting, "삭제할 글", "본문");
        entityManager.clear();

        mockMvc.perform(delete(detailPath(post.getId()))
                        .header("Authorization", bearer(operator)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.postId").value(post.getId()))
                .andExpect(jsonPath("$.data.status").value("PUBLISHED"))
                .andExpect(jsonPath("$.data.deletedAt").exists());

        entityManager.flush();
        entityManager.clear();
        Post reloaded = postRepository.findById(post.getId()).orElseThrow();
        assertThat(reloaded.getDeletedAt()).isNotNull();
        assertThat(reloaded.getStatus()).isEqualTo(PostStatus.PUBLISHED);

        mockMvc.perform(get(postsPath(meeting)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(0));
        mockMvc.perform(get(detailPath(post.getId())))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("POST_NOT_FOUND"));
    }

    /** 작성자가 아닌 소유 운영자의 삭제가 숨김 처리로 반영되는지 검증한다. */
    @Test
    void hidesPostWhenOwningOperatorDeletesOthersPost() throws Exception {
        User manager = saveUser("community-manager-h", UserRole.MANAGER);
        User influencer = saveUser("community-influencer-h", UserRole.INFLUENCER);
        FanMeeting meeting = saveMeetingWithManager(influencer, manager, "커뮤니티 팬미팅 H");
        Post post = savePost(manager, meeting, "매니저 글", "본문");
        entityManager.clear();

        mockMvc.perform(delete(detailPath(post.getId()))
                        .header("Authorization", bearer(influencer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("HIDDEN"))
                .andExpect(jsonPath("$.data.deletedAt").doesNotExist());

        entityManager.flush();
        entityManager.clear();
        Post reloaded = postRepository.findById(post.getId()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(PostStatus.HIDDEN);
        assertThat(reloaded.getDeletedAt()).isNull();

        mockMvc.perform(get(detailPath(post.getId())))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("POST_NOT_FOUND"));
    }

    /** 다른 팬미팅 운영자의 삭제가 거부되는지 검증한다. */
    @Test
    void rejectsDeleteByOtherMeetingOperator() throws Exception {
        User operator = saveUser("community-solo-i", UserRole.SOLO_INFLUENCER);
        User outsider = saveUser("community-solo-j", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "커뮤니티 팬미팅 I");
        saveMeeting(outsider, "커뮤니티 팬미팅 J");
        Post post = savePost(operator, meeting, "내 글", "본문");
        entityManager.clear();

        mockMvc.perform(delete(detailPath(post.getId()))
                        .header("Authorization", bearer(outsider)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        entityManager.clear();
        assertThat(postRepository.findById(post.getId()).orElseThrow().getDeletedAt()).isNull();
    }

    /** 이미 삭제한 글의 재삭제와 재수정이 404를 반환하는지 검증한다. */
    @Test
    void returnsNotFoundWhenDeletingOrUpdatingAlreadyDeletedPost() throws Exception {
        User operator = saveUser("community-solo-k", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "커뮤니티 팬미팅 K");
        Post post = savePost(operator, meeting, "삭제된 글", "본문");
        ReflectionTestUtils.setField(post, "deletedAt", LocalDateTime.of(2026, 7, 30, 9, 0));
        postRepository.flush();
        entityManager.clear();

        mockMvc.perform(delete(detailPath(post.getId()))
                        .header("Authorization", bearer(operator)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("POST_NOT_FOUND"));

        mockMvc.perform(patch(detailPath(post.getId()))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"재수정\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("POST_NOT_FOUND"));
    }

    /** 공지를 커뮤니티 경로로 조회·수정할 수 없는지 검증한다. */
    @Test
    void separatesCommunityPostsFromNotices() throws Exception {
        User operator = saveUser("community-solo-l", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "커뮤니티 팬미팅 L");
        Post notice = postRepository.saveAndFlush(Post.createNotice(
                operator, meeting, PostType.MEETING_NOTICE, "공지", "공지 본문"));
        entityManager.clear();

        mockMvc.perform(get(postsPath(meeting)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(0));

        mockMvc.perform(get(detailPath(notice.getId())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("POST_TYPE_MISMATCH"));

        mockMvc.perform(patch(detailPath(notice.getId()))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"공지 수정 시도\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("POST_TYPE_MISMATCH"));
    }

    /** 다른 팬미팅의 커뮤니티 글이 목록에 섞이지 않는지 검증한다. */
    @Test
    void doesNotMixCommunityPostsAcrossMeetings() throws Exception {
        User operatorA = saveUser("community-solo-m", UserRole.SOLO_INFLUENCER);
        User operatorB = saveUser("community-solo-n", UserRole.SOLO_INFLUENCER);
        FanMeeting meetingA = saveMeeting(operatorA, "커뮤니티 팬미팅 M");
        FanMeeting meetingB = saveMeeting(operatorB, "커뮤니티 팬미팅 N");
        savePost(operatorA, meetingA, "A 글", "본문");
        savePost(operatorB, meetingB, "B 글", "본문");
        entityManager.clear();

        mockMvc.perform(get(postsPath(meetingA)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].title").value("A 글"));
    }

    /** 삭제·숨김 글이 목록과 상세에서 제외되는지 검증한다. */
    @Test
    void excludesDeletedAndHiddenPosts() throws Exception {
        User operator = saveUser("community-solo-o", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "커뮤니티 팬미팅 O");
        Post deleted = savePost(operator, meeting, "삭제된 글", "본문");
        ReflectionTestUtils.setField(deleted, "deletedAt", LocalDateTime.of(2026, 7, 29, 9, 0));
        Post hidden = savePost(operator, meeting, "숨김 글", "본문");
        ReflectionTestUtils.setField(hidden, "status", PostStatus.HIDDEN);
        Post visible = savePost(operator, meeting, "노출 글", "본문");
        postRepository.flush();
        entityManager.clear();

        mockMvc.perform(get(postsPath(meeting)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].postId").value(visible.getId()));

        mockMvc.perform(get(detailPath(deleted.getId())))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("POST_NOT_FOUND"));
        mockMvc.perform(get(detailPath(hidden.getId())))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("POST_NOT_FOUND"));
    }

    /** 상단 고정 글이 최신 글보다 먼저 정렬되는지 검증한다. */
    @Test
    void sortsPinnedPostFirst() throws Exception {
        User operator = saveUser("community-solo-p", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "커뮤니티 팬미팅 P");
        Post pinned = savePost(operator, meeting, "고정 글", "본문");
        ReflectionTestUtils.setField(pinned, "pinned", true);
        Post latest = savePost(operator, meeting, "최신 글", "본문");
        postRepository.flush();
        entityManager.clear();

        mockMvc.perform(get(postsPath(meeting)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].postId").value(pinned.getId()))
                .andExpect(jsonPath("$.data.content[0].pinned").value(true))
                .andExpect(jsonPath("$.data.content[1].postId").value(latest.getId()));
    }

    /** 검색어가 제목과 본문 모두에 적용되는지 검증한다. */
    @Test
    void searchesKeywordInTitleAndContent() throws Exception {
        User operator = saveUser("community-solo-q", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "커뮤니티 팬미팅 Q");
        Post titleMatch = savePost(operator, meeting, "굿즈 안내", "일반 본문");
        Post contentMatch = savePost(operator, meeting, "일반 제목", "굿즈 수령 안내");
        savePost(operator, meeting, "관계없는 제목", "관계없는 본문");
        postRepository.flush();
        entityManager.clear();

        mockMvc.perform(get(postsPath(meeting)).param("keyword", "굿즈"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(2))
                .andExpect(jsonPath("$.data.content[0].postId").value(contentMatch.getId()))
                .andExpect(jsonPath("$.data.content[1].postId").value(titleMatch.getId()));
    }

    /** 페이지 경계값 1·20·100은 허용되고 101과 음수 페이지는 거부되는지 검증한다. */
    @Test
    void validatesPageBoundaries() throws Exception {
        User operator = saveUser("community-solo-r", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "커뮤니티 팬미팅 R");
        savePost(operator, meeting, "글 1", "본문");
        savePost(operator, meeting, "글 2", "본문");
        postRepository.flush();
        entityManager.clear();

        mockMvc.perform(get(postsPath(meeting)).param("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.size").value(1))
                .andExpect(jsonPath("$.data.totalPages").value(2))
                .andExpect(jsonPath("$.data.hasNext").value(true));
        mockMvc.perform(get(postsPath(meeting)).param("size", "100"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.size").value(100));
        mockMvc.perform(get(postsPath(meeting)).param("size", "101"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        mockMvc.perform(get(postsPath(meeting)).param("page", "-1"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        mockMvc.perform(get(postsPath(meeting)).param("page", "0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(2));
    }

    /** 작성 요청의 최대 길이 제목·본문이 허용되고 초과하면 거부되는지 검증한다. */
    @Test
    void validatesCreateLengthBoundaries() throws Exception {
        User operator = saveUser("community-solo-s", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "커뮤니티 팬미팅 S");
        String maxTitle = "가".repeat(CommunityPostCreateRequest.TITLE_MAX_LENGTH);
        String maxContent = "나".repeat(CommunityPostCreateRequest.CONTENT_MAX_LENGTH);

        mockMvc.perform(post(postsPath(meeting))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody(maxTitle, maxContent)))
                .andExpect(status().isCreated());

        mockMvc.perform(post(postsPath(meeting))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody(maxTitle + "가", "본문")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        mockMvc.perform(post(postsPath(meeting))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody("", "본문")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    /** 해당 팬미팅 운영자가 아닌 사용자의 글 작성이 거부되는지 검증한다. */
    @Test
    void rejectsCreationByNonOperator() throws Exception {
        User operator = saveUser("community-solo-t", UserRole.SOLO_INFLUENCER);
        User outsider = saveUser("community-solo-u", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "커뮤니티 팬미팅 T");

        mockMvc.perform(post(postsPath(meeting))
                        .header("Authorization", bearer(outsider))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody("남의 글", "본문")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        assertThat(postRepository.count()).isZero();
    }

    /** 인증 없이 작성·수정·삭제를 호출하면 401을 반환하는지 검증한다. */
    @Test
    void rejectsUnauthenticatedCommands() throws Exception {
        User operator = saveUser("community-solo-v", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "커뮤니티 팬미팅 V");
        Post post = savePost(operator, meeting, "글", "본문");
        entityManager.clear();

        mockMvc.perform(post(postsPath(meeting))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody("제목", "본문")))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(patch(detailPath(post.getId()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"제목\"}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(delete(detailPath(post.getId())))
                .andExpect(status().isUnauthorized());
    }

    /** 존재하지 않는 팬미팅과 게시글 요청이 각각 404를 반환하는지 검증한다. */
    @Test
    void returnsNotFoundForMissingMeetingAndPost() throws Exception {
        User operator = saveUser("community-solo-w", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "커뮤니티 팬미팅 W");
        long missingId = meeting.getId() + 9_999L;

        mockMvc.perform(get("/api/v1/fan-meetings/" + missingId + "/community/posts"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("FAN_MEETING_NOT_FOUND"));
        mockMvc.perform(get(detailPath(missingId)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("POST_NOT_FOUND"));
        mockMvc.perform(post("/api/v1/fan-meetings/" + missingId + "/community/posts")
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody("제목", "본문")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("FAN_MEETING_NOT_FOUND"));
        mockMvc.perform(delete(detailPath(missingId))
                        .header("Authorization", bearer(operator)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("POST_NOT_FOUND"));
    }

    /** 글이 없는 팬미팅이 빈 목록을 반환하는지 검증한다. */
    @Test
    void returnsEmptyListForMeetingWithoutPost() throws Exception {
        User operator = saveUser("community-solo-x", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "커뮤니티 팬미팅 X");

        mockMvc.perform(get(postsPath(meeting)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isEmpty())
                .andExpect(jsonPath("$.data.totalElements").value(0))
                .andExpect(jsonPath("$.data.totalPages").value(0))
                .andExpect(jsonPath("$.data.hasNext").value(false));
    }

    /** 작성자가 서로 다른 글이 여러 건이어도 목록 조회 SQL 수가 늘어나지 않는지 실행 통계로 검증한다. */
    @Test
    void queriesCommunityListWithoutNPlusOne() throws Exception {
        User operator = saveUser("community-solo-y", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "커뮤니티 팬미팅 Y");
        // 작성자를 모두 다르게 만들어 fetch join이 빠지면 작성자 수만큼 조회가 늘어나도록 한다.
        for (int index = 1; index <= 5; index++) {
            savePost(saveUser("community-author-" + index, UserRole.MANAGER), meeting,
                    "글 " + index, "본문 " + index);
        }
        postRepository.flush();
        entityManager.clear();
        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.clear();

        mockMvc.perform(get(postsPath(meeting)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(5));

        // 팬미팅 조회 1건과 목록 조회 1건뿐이며 작성자별 추가 조회는 없어야 한다.
        // 전체 결과가 첫 페이지에 담기면 Spring Data가 count 쿼리를 생략한다.
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(2L);
    }

    /** 커뮤니티 목록·작성 API 경로를 만든다. */
    private String postsPath(FanMeeting meeting) {
        return "/api/v1/fan-meetings/" + meeting.getId() + "/community/posts";
    }

    /** 커뮤니티 상세·수정·삭제 API 경로를 만든다. */
    private String detailPath(long postId) {
        return "/api/v1/community/posts/" + postId;
    }

    /** 실제 발급한 Access Token으로 Authorization 헤더 값을 만든다. */
    private String bearer(User user) {
        return "Bearer " + jwtTokenProvider.issue(user).accessToken();
    }

    /** 커뮤니티 글 작성 요청 본문 JSON을 만든다. */
    private String createBody(String title, String content) {
        return "{\"title\":\"" + title + "\",\"content\":\"" + content + "\"}";
    }

    /** 작성 응답에서 생성된 게시글 식별자를 꺼낸다. */
    private long postIdOf(MvcResult result) throws Exception {
        String body = result.getResponse().getContentAsString();
        String marker = "\"postId\":";
        int start = body.indexOf(marker) + marker.length();
        int end = body.indexOf(',', start);
        return Long.parseLong(body.substring(start, end).trim());
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

    /** 담당 매니저가 있는 팬미팅을 저장한다. */
    private FanMeeting saveMeetingWithManager(User influencer, User manager, String title) {
        return fanMeetingRepository.saveAndFlush(FanMeeting.create(
                null, manager, influencer, title, "설명", null,
                LocalDateTime.of(2026, 8, 1, 19, 0)
        ));
    }

    /** 통합 테스트에 사용할 커뮤니티 게시글을 저장한다. */
    private Post savePost(User author, FanMeeting meeting, String title, String content) {
        return postRepository.saveAndFlush(Post.createCommunity(author, meeting, title, content));
    }
}
