package com.ssafy.backend.post.controller;

import com.ssafy.backend.auth.jwt.JwtTokenProvider;
import com.ssafy.backend.auth.jwt.RevokedAccessTokenStore;
import com.ssafy.backend.auth.jwt.TokenSessionStore;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.post.domain.Post;
import com.ssafy.backend.post.domain.PostStatus;
import com.ssafy.backend.post.domain.PostType;
import com.ssafy.backend.post.dto.PostUpdateRequest;
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
 * 실제 DB(H2)와 실제 발급 JWT로 팬미팅 공지 수정·삭제 API를 통합 검증한다.
 *
 * <p>Redis에 의존하는 토큰 폐기·세션 저장소만 대체하고 Security 필터부터 저장소까지는 실제 빈을 사용한다.
 */
@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:notice-modify-api;MODE=MySQL;DB_CLOSE_DELAY=-1",
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
class NoticeModifyApiIntegrationTest {

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

    /** 작성자가 제목만 보내도 본문이 유지되고 상세 조회에 반영되는지 검증한다. */
    @Test
    void updatesOnlyProvidedFieldByAuthor() throws Exception {
        User operator = saveUser("notice-solo-a", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "공지 팬미팅 A");
        Post notice = saveNotice(operator, meeting, "원래 공지", "원래 본문");
        entityManager.clear();

        mockMvc.perform(patch(noticePath(meeting, notice.getId()))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"  바뀐 본문  \"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.postId").value(notice.getId()))
                .andExpect(jsonPath("$.data.meetingId").value(meeting.getId()))
                .andExpect(jsonPath("$.data.title").value("원래 공지"))
                .andExpect(jsonPath("$.data.content").value("바뀐 본문"))
                .andExpect(jsonPath("$.data.updatedAt").exists());

        entityManager.flush();
        entityManager.clear();
        Post reloaded = postRepository.findById(notice.getId()).orElseThrow();
        assertThat(reloaded.getTitle()).isEqualTo("원래 공지");
        assertThat(reloaded.getContent()).isEqualTo("바뀐 본문");

        mockMvc.perform(get(noticePath(meeting, notice.getId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").value("바뀐 본문"));
    }

    /** 서비스 운영자(ADMIN)가 다른 사람의 공지를 수정할 수 있는지 검증한다. */
    @Test
    void allowsAdminToUpdateOthersNotice() throws Exception {
        User operator = saveUser("notice-solo-b", UserRole.SOLO_INFLUENCER);
        User admin = saveUser("notice-admin-b", UserRole.ADMIN);
        FanMeeting meeting = saveMeeting(operator, "공지 팬미팅 B");
        Post notice = saveNotice(operator, meeting, "공지", "본문");
        entityManager.clear();

        mockMvc.perform(patch(noticePath(meeting, notice.getId()))
                        .header("Authorization", bearer(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"관리자 수정\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.title").value("관리자 수정"));
    }

    /** 작성자도 ADMIN도 아닌 사용자의 수정이 거부되는지 검증한다. */
    @Test
    void rejectsUpdateByNonAuthor() throws Exception {
        User operator = saveUser("notice-solo-c", UserRole.SOLO_INFLUENCER);
        User outsider = saveUser("notice-solo-d", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "공지 팬미팅 C");
        Post notice = saveNotice(operator, meeting, "공지", "본문");
        entityManager.clear();

        mockMvc.perform(patch(noticePath(meeting, notice.getId()))
                        .header("Authorization", bearer(outsider))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"남의 공지 수정\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        entityManager.clear();
        assertThat(postRepository.findById(notice.getId()).orElseThrow().getTitle())
                .isEqualTo("공지");
    }

    /** 다른 팬미팅 경로로 들어온 공지 수정·삭제가 404를 반환하는지 검증한다. */
    @Test
    void returnsNotFoundForNoticeOfAnotherMeeting() throws Exception {
        User operator = saveUser("notice-solo-e", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "공지 팬미팅 E");
        FanMeeting otherMeeting = saveMeeting(operator, "공지 팬미팅 E2");
        Post notice = saveNotice(operator, meeting, "공지", "본문");
        entityManager.clear();

        mockMvc.perform(patch(noticePath(otherMeeting, notice.getId()))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"경로 바꿔 수정\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("POST_NOT_FOUND"));

        mockMvc.perform(delete(noticePath(otherMeeting, notice.getId()))
                        .header("Authorization", bearer(operator)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("POST_NOT_FOUND"));
    }

    /** 작성자 삭제가 논리 삭제로 처리되고 목록·상세에서 제외되는지 검증한다. */
    @Test
    void softDeletesNoticeByAuthor() throws Exception {
        User operator = saveUser("notice-solo-f", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "공지 팬미팅 F");
        Post notice = saveNotice(operator, meeting, "삭제할 공지", "본문");
        entityManager.clear();

        mockMvc.perform(delete(noticePath(meeting, notice.getId()))
                        .header("Authorization", bearer(operator)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.postId").value(notice.getId()))
                .andExpect(jsonPath("$.data.status").value("PUBLISHED"))
                .andExpect(jsonPath("$.data.deletedAt").exists());

        entityManager.flush();
        entityManager.clear();
        Post reloaded = postRepository.findById(notice.getId()).orElseThrow();
        assertThat(reloaded.getDeletedAt()).isNotNull();

        mockMvc.perform(get("/api/v1/fan-meetings/" + meeting.getId() + "/notices"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(0));
        mockMvc.perform(get(noticePath(meeting, notice.getId())))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("POST_NOT_FOUND"));
    }

    /** 작성자가 아닌 ADMIN의 삭제가 숨김 처리로 반영되는지 검증한다. */
    @Test
    void hidesNoticeWhenAdminDeletesOthersNotice() throws Exception {
        User operator = saveUser("notice-solo-g", UserRole.SOLO_INFLUENCER);
        User admin = saveUser("notice-admin-g", UserRole.ADMIN);
        FanMeeting meeting = saveMeeting(operator, "공지 팬미팅 G");
        Post notice = saveNotice(operator, meeting, "공지", "본문");
        entityManager.clear();

        mockMvc.perform(delete(noticePath(meeting, notice.getId()))
                        .header("Authorization", bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("HIDDEN"))
                .andExpect(jsonPath("$.data.deletedAt").doesNotExist());

        entityManager.flush();
        entityManager.clear();
        Post reloaded = postRepository.findById(notice.getId()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(PostStatus.HIDDEN);
        assertThat(reloaded.getDeletedAt()).isNull();
    }

    /** 이미 삭제한 공지의 재삭제와 재수정이 404를 반환하는지 검증한다. */
    @Test
    void returnsNotFoundWhenDeletingAlreadyDeletedNotice() throws Exception {
        User operator = saveUser("notice-solo-h", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "공지 팬미팅 H");
        Post notice = saveNotice(operator, meeting, "삭제된 공지", "본문");
        ReflectionTestUtils.setField(notice, "deletedAt", LocalDateTime.of(2026, 7, 30, 9, 0));
        postRepository.flush();
        entityManager.clear();

        mockMvc.perform(delete(noticePath(meeting, notice.getId()))
                        .header("Authorization", bearer(operator)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("POST_NOT_FOUND"));

        mockMvc.perform(patch(noticePath(meeting, notice.getId()))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"재수정\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("POST_NOT_FOUND"));
    }

    /** 커뮤니티 글을 공지 경로로 수정·삭제할 수 없는지 검증한다. */
    @Test
    void rejectsCommunityPostThroughNoticePath() throws Exception {
        User operator = saveUser("notice-solo-i", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "공지 팬미팅 I");
        Post community = postRepository.saveAndFlush(
                Post.createCommunity(operator, meeting, "커뮤니티 글", "본문"));
        entityManager.clear();

        mockMvc.perform(patch(noticePath(meeting, community.getId()))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"공지처럼 수정\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("POST_TYPE_MISMATCH"));

        mockMvc.perform(delete(noticePath(meeting, community.getId()))
                        .header("Authorization", bearer(operator)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("POST_TYPE_MISMATCH"));
    }

    /** 빈 값과 수정할 항목이 없는 요청, 최대 길이 초과가 거부되는지 검증한다. */
    @Test
    void validatesUpdateRequest() throws Exception {
        User operator = saveUser("notice-solo-j", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "공지 팬미팅 J");
        Post notice = saveNotice(operator, meeting, "공지", "본문");
        entityManager.clear();
        String maxTitle = "가".repeat(PostUpdateRequest.TITLE_MAX_LENGTH);

        mockMvc.perform(patch(noticePath(meeting, notice.getId()))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"  \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        mockMvc.perform(patch(noticePath(meeting, notice.getId()))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        mockMvc.perform(patch(noticePath(meeting, notice.getId()))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"" + maxTitle + "\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(patch(noticePath(meeting, notice.getId()))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"" + maxTitle + "가\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    /** 인증 없이 공지 수정·삭제를 호출하면 401을 반환하는지 검증한다. */
    @Test
    void rejectsUnauthenticatedCommands() throws Exception {
        User operator = saveUser("notice-solo-k", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "공지 팬미팅 K");
        Post notice = saveNotice(operator, meeting, "공지", "본문");
        entityManager.clear();

        mockMvc.perform(patch(noticePath(meeting, notice.getId()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"제목\"}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(delete(noticePath(meeting, notice.getId())))
                .andExpect(status().isUnauthorized());
    }

    /** 존재하지 않는 공지 수정·삭제가 404를 반환하는지 검증한다. */
    @Test
    void returnsNotFoundForMissingNotice() throws Exception {
        User operator = saveUser("notice-solo-l", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "공지 팬미팅 L");
        long missingId = meeting.getId() + 9_999L;

        mockMvc.perform(patch(noticePath(meeting, missingId))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"제목\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("POST_NOT_FOUND"));
        mockMvc.perform(delete(noticePath(meeting, missingId))
                        .header("Authorization", bearer(operator)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("POST_NOT_FOUND"));
    }

    /** 공지 수정·삭제 API 경로를 만든다. */
    private String noticePath(FanMeeting meeting, long noticeId) {
        return "/api/v1/fan-meetings/" + meeting.getId() + "/notices/" + noticeId;
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

    /** 통합 테스트에 사용할 팬미팅 공지를 저장한다. */
    private Post saveNotice(User author, FanMeeting meeting, String title, String content) {
        return postRepository.saveAndFlush(Post.createNotice(
                author, meeting, PostType.MEETING_NOTICE, title, content));
    }
}
