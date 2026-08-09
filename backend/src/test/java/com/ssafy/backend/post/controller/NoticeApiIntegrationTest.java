package com.ssafy.backend.post.controller;

import com.ssafy.backend.auth.jwt.JwtTokenProvider;
import com.ssafy.backend.auth.jwt.RevokedAccessTokenStore;
import com.ssafy.backend.auth.jwt.TokenSessionStore;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.post.domain.Post;
import com.ssafy.backend.post.domain.PostStatus;
import com.ssafy.backend.post.domain.PostType;
import com.ssafy.backend.post.dto.NoticeCreateRequest;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 실제 DB(H2)와 실제 발급 JWT로 공지 API의 HTTP 요청·응답과 저장 결과를 통합 검증한다.
 *
 * <p>Redis에 의존하는 토큰 폐기·세션 저장소만 대체하고 Security 필터부터 저장소까지는 실제 빈을 사용한다.
 */
@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:notice-api;MODE=MySQL;DB_CLOSE_DELAY=-1",
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
class NoticeApiIntegrationTest {

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

    /** 운영자가 작성한 공지가 목록과 상세에 즉시 나타나고 DB에도 공개 상태로 저장되는지 검증한다. */
    @Test
    void createsNoticeAndExposesItThroughListAndDetail() throws Exception {
        User operator = saveUser("solo-operator", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "운영 팬미팅");

        MvcResult created = mockMvc.perform(post(noticesPath(meeting))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody("첫 번째 공지", "공지 본문입니다")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.meetingId").value(meeting.getId()))
                .andExpect(jsonPath("$.data.title").value("첫 번째 공지"))
                .andExpect(jsonPath("$.data.createdAt").exists())
                .andReturn();
        long noticeId = noticeIdOf(created);

        Post saved = postRepository.findById(noticeId).orElseThrow();
        assertThat(saved.getType()).isEqualTo(PostType.MEETING_NOTICE);
        assertThat(saved.getStatus()).isEqualTo(PostStatus.PUBLISHED);
        assertThat(saved.getMeeting().getId()).isEqualTo(meeting.getId());
        assertThat(saved.getAuthor().getId()).isEqualTo(operator.getId());
        assertThat(saved.getDeletedAt()).isNull();

        mockMvc.perform(get(noticesPath(meeting)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].noticeId").value(noticeId))
                .andExpect(jsonPath("$.data.content[0].meetingId").value(meeting.getId()))
                .andExpect(jsonPath("$.data.content[0].authorNickname").value(operator.getNickname()))
                .andExpect(jsonPath("$.data.content[0].thumbnailUrl").doesNotExist())
                .andExpect(jsonPath("$.data.content[0].pinned").value(false));

        mockMvc.perform(get(noticesPath(meeting) + "/" + noticeId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").value("공지 본문입니다"))
                .andExpect(jsonPath("$.data.attachments").isEmpty())
                .andExpect(jsonPath("$.data.updatedAt").exists())
                .andExpect(jsonPath("$.data.canEdit").value(false))
                .andExpect(jsonPath("$.data.canDelete").value(false));

        mockMvc.perform(get(noticesPath(meeting) + "/" + noticeId)
                        .header("Authorization", bearer(operator)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.canEdit").value(true))
                .andExpect(jsonPath("$.data.canDelete").value(true));
    }

    /** 다른 팬미팅의 공지가 목록과 상세에 섞이지 않는지 검증한다. */
    @Test
    void doesNotMixNoticesAcrossMeetings() throws Exception {
        User operator = saveUser("solo-a", UserRole.SOLO_INFLUENCER);
        User otherOperator = saveUser("solo-b", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "A 팬미팅");
        FanMeeting otherMeeting = saveMeeting(otherOperator, "B 팬미팅");

        long noticeId = noticeIdOf(mockMvc.perform(post(noticesPath(meeting))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody("A 공지", "A 본문")))
                .andExpect(status().isCreated())
                .andReturn());
        mockMvc.perform(post(noticesPath(otherMeeting))
                        .header("Authorization", bearer(otherOperator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody("B 공지", "B 본문")))
                .andExpect(status().isCreated());

        mockMvc.perform(get(noticesPath(meeting)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].title").value("A 공지"));

        mockMvc.perform(get(noticesPath(otherMeeting) + "/" + noticeId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("POST_NOT_FOUND"));
    }

    /** 팬미팅 공지가 서비스 공지 목록·상세에 노출되지 않는지 검증한다. */
    @Test
    void separatesServiceNoticesFromMeetingNotices() throws Exception {
        User operator = saveUser("solo-c", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "C 팬미팅");
        long noticeId = noticeIdOf(mockMvc.perform(post(noticesPath(meeting))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody("C 공지", "C 본문")))
                .andExpect(status().isCreated())
                .andReturn());

        mockMvc.perform(get("/api/v1/service-notices"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(0))
                .andExpect(jsonPath("$.data.content").isEmpty());

        mockMvc.perform(get("/api/v1/service-notices/" + noticeId))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("POST_TYPE_MISMATCH"));
    }

    /** 서비스 공지가 유형별 목록·상세에서 정상 조회되는지 검증한다. */
    @Test
    void readsServiceNoticeListAndDetail() throws Exception {
        User admin = saveUser("service-admin", UserRole.ADMIN);
        Post notice = postRepository.saveAndFlush(Post.createNotice(
                admin, null, PostType.SERVICE_NOTICE, "서비스 점검 공지", "점검 본문"
        ));
        entityManager.clear();

        mockMvc.perform(get("/api/v1/service-notices"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].noticeId").value(notice.getId()))
                .andExpect(jsonPath("$.data.content[0].meetingId").doesNotExist());

        mockMvc.perform(get("/api/v1/service-notices/" + notice.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").value("점검 본문"))
                .andExpect(jsonPath("$.data.attachments").isEmpty())
                .andExpect(jsonPath("$.data.canEdit").value(false));

        mockMvc.perform(get("/api/v1/service-notices/" + notice.getId())
                        .header("Authorization", bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.canEdit").value(true))
                .andExpect(jsonPath("$.data.canDelete").value(true));
    }

    /** 삭제·숨김 공지가 목록과 상세에서 제외되는지 검증한다. */
    @Test
    void excludesDeletedAndHiddenNotices() throws Exception {
        User operator = saveUser("solo-d", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "D 팬미팅");
        Post deleted = postRepository.save(Post.createNotice(
                operator, meeting, PostType.MEETING_NOTICE, "삭제된 공지", "본문"
        ));
        ReflectionTestUtils.setField(deleted, "deletedAt", LocalDateTime.of(2026, 7, 29, 9, 0));
        Post hidden = postRepository.save(Post.createNotice(
                operator, meeting, PostType.MEETING_NOTICE, "숨김 공지", "본문"
        ));
        ReflectionTestUtils.setField(hidden, "status", PostStatus.HIDDEN);
        Post visible = postRepository.save(Post.createNotice(
                operator, meeting, PostType.MEETING_NOTICE, "노출 공지", "본문"
        ));
        postRepository.flush();
        entityManager.clear();

        mockMvc.perform(get(noticesPath(meeting)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].noticeId").value(visible.getId()));

        mockMvc.perform(get(noticesPath(meeting) + "/" + deleted.getId()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("POST_NOT_FOUND"));
        mockMvc.perform(get(noticesPath(meeting) + "/" + hidden.getId()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("POST_NOT_FOUND"));
    }

    /** 상단 고정 공지가 최신 공지보다 먼저 정렬되는지 검증한다. */
    @Test
    void sortsPinnedNoticeFirst() throws Exception {
        User operator = saveUser("solo-e", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "E 팬미팅");
        Post pinned = postRepository.save(Post.createNotice(
                operator, meeting, PostType.MEETING_NOTICE, "고정 공지", "본문"
        ));
        ReflectionTestUtils.setField(pinned, "pinned", true);
        Post latest = postRepository.save(Post.createNotice(
                operator, meeting, PostType.MEETING_NOTICE, "최신 공지", "본문"
        ));
        postRepository.flush();
        entityManager.clear();

        mockMvc.perform(get(noticesPath(meeting)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].noticeId").value(pinned.getId()))
                .andExpect(jsonPath("$.data.content[0].pinned").value(true))
                .andExpect(jsonPath("$.data.content[1].noticeId").value(latest.getId()));
    }

    /** 검색어가 제목과 본문 모두에 적용되는지 검증한다. */
    @Test
    void searchesKeywordInTitleAndContent() throws Exception {
        User operator = saveUser("solo-f", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "F 팬미팅");
        Post titleMatch = postRepository.save(Post.createNotice(
                operator, meeting, PostType.MEETING_NOTICE, "환불 안내", "일반 본문"
        ));
        Post contentMatch = postRepository.save(Post.createNotice(
                operator, meeting, PostType.MEETING_NOTICE, "일반 제목", "환불 절차 안내"
        ));
        postRepository.save(Post.createNotice(
                operator, meeting, PostType.MEETING_NOTICE, "관계없는 제목", "관계없는 본문"
        ));
        postRepository.flush();
        entityManager.clear();

        mockMvc.perform(get(noticesPath(meeting)).param("keyword", "환불"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(2))
                .andExpect(jsonPath("$.data.content[0].noticeId").value(contentMatch.getId()))
                .andExpect(jsonPath("$.data.content[1].noticeId").value(titleMatch.getId()));
    }

    /** 페이지 크기 경계값 1·20·100은 허용되고 101과 음수 페이지는 거부되는지 검증한다. */
    @Test
    void validatesPageBoundaries() throws Exception {
        User operator = saveUser("solo-g", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "G 팬미팅");
        postRepository.saveAllAndFlush(java.util.List.of(
                Post.createNotice(operator, meeting, PostType.MEETING_NOTICE, "공지 1", "본문"),
                Post.createNotice(operator, meeting, PostType.MEETING_NOTICE, "공지 2", "본문")
        ));
        entityManager.clear();

        mockMvc.perform(get(noticesPath(meeting)).param("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.size").value(1))
                .andExpect(jsonPath("$.data.totalPages").value(2))
                .andExpect(jsonPath("$.data.hasNext").value(true));
        mockMvc.perform(get(noticesPath(meeting)).param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.size").value(20));
        mockMvc.perform(get(noticesPath(meeting)).param("size", "100"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.size").value(100));
        mockMvc.perform(get(noticesPath(meeting)).param("size", "101"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        mockMvc.perform(get(noticesPath(meeting)).param("page", "-1"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        mockMvc.perform(get(noticesPath(meeting)).param("page", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isEmpty())
                .andExpect(jsonPath("$.data.totalElements").value(2));
    }

    /** 최대 길이 제목·본문은 저장되고 한 글자 초과하면 거부되는지 검증한다. */
    @Test
    void validatesTitleAndContentLength() throws Exception {
        User operator = saveUser("solo-h", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "H 팬미팅");
        String maxTitle = "가".repeat(NoticeCreateRequest.TITLE_MAX_LENGTH);
        String maxContent = "나".repeat(NoticeCreateRequest.CONTENT_MAX_LENGTH);

        mockMvc.perform(post(noticesPath(meeting))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody(maxTitle, maxContent)))
                .andExpect(status().isCreated());

        mockMvc.perform(post(noticesPath(meeting))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody(maxTitle + "가", "본문")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        mockMvc.perform(post(noticesPath(meeting))
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody("제목", maxContent + "나")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    /** 해당 팬미팅 운영자가 아닌 사용자의 공지 작성이 거부되는지 검증한다. */
    @Test
    void rejectsNoticeCreationByNonOperator() throws Exception {
        User operator = saveUser("solo-i", UserRole.SOLO_INFLUENCER);
        User outsider = saveUser("solo-j", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "I 팬미팅");

        mockMvc.perform(post(noticesPath(meeting))
                        .header("Authorization", bearer(outsider))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody("남의 공지", "본문")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        assertThat(postRepository.count()).isZero();
    }

    /** 존재하지 않는 팬미팅과 공지 요청이 각각 404를 반환하는지 검증한다. */
    @Test
    void returnsNotFoundForMissingMeetingAndNotice() throws Exception {
        User operator = saveUser("solo-k", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "K 팬미팅");
        long missingId = meeting.getId() + 9_999L;

        mockMvc.perform(get("/api/v1/fan-meetings/" + missingId + "/notices"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("FAN_MEETING_NOT_FOUND"));
        mockMvc.perform(get(noticesPath(meeting) + "/" + missingId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("POST_NOT_FOUND"));
        mockMvc.perform(get("/api/v1/service-notices/" + missingId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("POST_NOT_FOUND"));
        mockMvc.perform(post("/api/v1/fan-meetings/" + missingId + "/notices")
                        .header("Authorization", bearer(operator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody("제목", "본문")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("FAN_MEETING_NOT_FOUND"));
    }

    /** 공지가 없는 팬미팅이 빈 목록을 반환하는지 검증한다. */
    @Test
    void returnsEmptyListForMeetingWithoutNotice() throws Exception {
        User operator = saveUser("solo-l", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "L 팬미팅");

        mockMvc.perform(get(noticesPath(meeting)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isEmpty())
                .andExpect(jsonPath("$.data.totalElements").value(0))
                .andExpect(jsonPath("$.data.totalPages").value(0))
                .andExpect(jsonPath("$.data.hasNext").value(false));
    }

    /** 작성자가 서로 다른 공지가 여러 건이어도 목록 조회 SQL 수가 늘어나지 않는지 실행 통계로 검증한다. */
    @Test
    void queriesNoticeListWithoutNPlusOne() throws Exception {
        User operator = saveUser("solo-m", UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = saveMeeting(operator, "M 팬미팅");
        // 작성자를 모두 다르게 만들어 fetch join이 빠지면 작성자 수만큼 조회가 늘어나도록 한다.
        for (int index = 1; index <= 5; index++) {
            postRepository.save(Post.createNotice(
                    saveUser("notice-author-" + index, UserRole.MANAGER), meeting,
                    PostType.MEETING_NOTICE, "공지 " + index, "본문 " + index
            ));
        }
        postRepository.flush();
        entityManager.clear();
        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.clear();

        mockMvc.perform(get(noticesPath(meeting)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(5));

        // 팬미팅 조회 1건과 목록 조회 1건뿐이며 작성자별 추가 조회는 없어야 한다.
        // 전체 결과가 첫 페이지에 담기면 Spring Data가 count 쿼리를 생략한다.
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(2L);
    }

    /** 공지 작성 API 경로를 만든다. */
    private String noticesPath(FanMeeting meeting) {
        return "/api/v1/fan-meetings/" + meeting.getId() + "/notices";
    }

    /** 실제 발급한 Access Token으로 Authorization 헤더 값을 만든다. */
    private String bearer(User user) {
        return "Bearer " + jwtTokenProvider.issue(user).accessToken();
    }

    /** 공지 작성 요청 본문 JSON을 만든다. */
    private String createBody(String title, String content) {
        return "{\"title\":\"" + title + "\",\"content\":\"" + content + "\"}";
    }

    /** 작성 응답에서 생성된 공지 식별자를 꺼낸다. */
    private long noticeIdOf(MvcResult result) throws Exception {
        String body = result.getResponse().getContentAsString();
        String marker = "\"noticeId\":";
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
}
