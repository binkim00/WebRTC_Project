package com.ssafy.backend.influencer.controller;

import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.application.domain.ApplicationStatus;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.influencer.domain.FanMemo;
import com.ssafy.backend.influencer.repository.FanMemoRepository;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.organization.domain.Organization;
import com.ssafy.backend.organization.domain.OrganizationMember;
import com.ssafy.backend.organization.domain.OrganizationMemberType;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
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
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:fan-memo-api;MODE=MySQL;DB_CLOSE_DELAY=-1",
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
class FanMemoApiIntegrationTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 7, 31, 12, 0);

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @Autowired
    private FanMemoRepository fanMemoRepository;

    private User influencer;
    private User otherInfluencer;
    private User sameOrganizationManager;
    private User otherOrganizationManager;
    private User fan;
    private FanMeeting meeting;

    /** 같은 조직 인플루언서·매니저와 참가 팬이 있는 팬미팅 환경을 준비한다. */
    @BeforeEach
    void setUp() {
        influencer = persistUser("memo-influencer", "테스트인플루언서", UserRole.INFLUENCER);
        otherInfluencer = persistUser("memo-other-influencer", "다른인플루언서", UserRole.INFLUENCER);
        sameOrganizationManager = persistUser("memo-manager", "같은조직매니저", UserRole.MANAGER);
        otherOrganizationManager = persistUser("memo-other-manager", "다른조직매니저", UserRole.MANAGER);
        fan = persistUser("memo-fan", "메모팬", UserRole.FAN);

        Organization organization = persistOrganization("멜리 소속사");
        Organization otherOrganization = persistOrganization("다른 소속사");
        persistMembership(organization, sameOrganizationManager, OrganizationMemberType.MANAGER);
        persistMembership(organization, influencer, OrganizationMemberType.INFLUENCER);
        persistMembership(otherOrganization, otherOrganizationManager, OrganizationMemberType.MANAGER);
        persistMembership(otherOrganization, otherInfluencer, OrganizationMemberType.INFLUENCER);

        meeting = persistMeeting(sameOrganizationManager, influencer, organization, "7월 팬미팅");
        persistParticipant(meeting, fan);
        entityManager.flush();
        entityManager.clear();
    }

    /** 메모를 작성하면 테이블 행이 남고 목록 조회에 최신 항목으로 나타나는지 검증한다. */
    @Test
    void createsMemoAndFindsItInList() throws Exception {
        mockMvc.perform(post(memosUrl()).with(as(influencer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"meetingId\":" + meeting.getId() + ",\"content\":\"  통화 내용 메모  \"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.memoId").isNumber())
                .andExpect(jsonPath("$.data.fanId").value(fan.getId()))
                .andExpect(jsonPath("$.data.meetingId").value(meeting.getId()))
                .andExpect(jsonPath("$.data.content").value("통화 내용 메모"))
                .andExpect(jsonPath("$.data.createdAt").exists());

        List<FanMemo> saved = fanMemoRepository.findAll();
        assertThat(saved).hasSize(1);
        FanMemo memo = saved.get(0);
        assertThat(memo.getInfluencer().getId()).isEqualTo(influencer.getId());
        assertThat(memo.getFan().getId()).isEqualTo(fan.getId());
        assertThat(memo.getMeeting().getId()).isEqualTo(meeting.getId());
        assertThat(memo.getContent()).isEqualTo("통화 내용 메모");
        assertThat(memo.getCreatedAt()).isNotNull();
        assertThat(memo.getUpdatedAt()).isNotNull();
        assertThat(memo.getDeletedAt()).isNull();

        mockMvc.perform(get(memosUrl()).with(as(influencer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].memoId").value(memo.getId()))
                .andExpect(jsonPath("$.data.content[0].meetingId").value(meeting.getId()))
                .andExpect(jsonPath("$.data.content[0].meetingTitle").value("7월 팬미팅"))
                .andExpect(jsonPath("$.data.content[0].content").value("통화 내용 메모"))
                .andExpect(jsonPath("$.data.content[0].createdAt").exists())
                .andExpect(jsonPath("$.data.content[0].updatedAt").exists());
    }

    /** 회차를 지정하지 않은 메모가 저장되고 회차 정보 없이 조회되는지 검증한다. */
    @Test
    void createsMemoWithoutMeeting() throws Exception {
        mockMvc.perform(post(memosUrl()).with(as(influencer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"회차 없는 메모\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.meetingId").doesNotExist());

        assertThat(fanMemoRepository.findAll().get(0).getMeeting()).isNull();

        mockMvc.perform(get(memosUrl()).with(as(influencer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].meetingId").doesNotExist())
                .andExpect(jsonPath("$.data.content[0].meetingTitle").doesNotExist())
                .andExpect(jsonPath("$.data.content[0].content").value("회차 없는 메모"));
    }

    /** 참가하지 않은 팬을 회차와 함께 기록하려는 요청이 거부되는지 검증한다. */
    @Test
    void rejectsMemoForNonParticipantFan() throws Exception {
        User outsiderFan = persistUser("memo-outsider-fan", "미참가팬", UserRole.FAN);
        entityManager.flush();

        mockMvc.perform(post("/api/v1/influencers/me/fans/" + outsiderFan.getId() + "/memos")
                        .with(as(influencer)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"meetingId\":" + meeting.getId() + ",\"content\":\"내용\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PARTICIPANT_NOT_IN_MEETING"));

        assertThat(fanMemoRepository.findAll()).isEmpty();
    }

    /** 다른 인플루언서가 주최한 회차를 지정한 작성 요청이 거부되는지 검증한다. */
    @Test
    void rejectsMemoOnOtherInfluencersMeeting() throws Exception {
        mockMvc.perform(post(memosUrl()).with(as(otherInfluencer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"meetingId\":" + meeting.getId() + ",\"content\":\"내용\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        assertThat(fanMemoRepository.findAll()).isEmpty();
    }

    /** 존재하지 않는 팬을 대상으로 한 작성 요청이 거부되는지 검증한다. */
    @Test
    void rejectsMemoForUnknownFan() throws Exception {
        mockMvc.perform(post("/api/v1/influencers/me/fans/999999/memos").with(as(influencer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"내용\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("FAN_NOT_FOUND"));

        assertThat(fanMemoRepository.findAll()).isEmpty();
    }

    /** 수정 요청이 내용과 수정 시각을 바꾸고 작성 시각은 유지하는지 검증한다. */
    @Test
    void updatesMemoContentAndUpdatedAt() throws Exception {
        FanMemo memo = persistMemo(influencer, meeting, "원본 메모");
        entityManager.flush();
        Long memoId = memo.getId();
        // 수정 시각이 실제로 갱신되는지 보려면 저장된 시각을 JPA 우회로 과거로 되돌려야 한다.
        entityManager.createNativeQuery(
                        "update fan_memos set created_at = ?1, updated_at = ?1 where fan_memo_id = ?2")
                .setParameter(1, NOW.minusDays(1))
                .setParameter(2, memoId)
                .executeUpdate();
        entityManager.clear();

        mockMvc.perform(patch("/api/v1/fan-memos/" + memoId).with(as(influencer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"수정된 메모\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.memoId").value(memoId))
                .andExpect(jsonPath("$.data.content").value("수정된 메모"))
                .andExpect(jsonPath("$.data.updatedAt").exists());

        entityManager.clear();
        FanMemo reloaded = fanMemoRepository.findById(memoId).orElseThrow();
        assertThat(reloaded.getContent()).isEqualTo("수정된 메모");
        assertThat(reloaded.getCreatedAt()).isEqualTo(NOW.minusDays(1));
        assertThat(reloaded.getUpdatedAt()).isAfter(NOW.minusDays(1));
        assertThat(reloaded.getDeletedAt()).isNull();
    }

    /** 작성자가 아닌 인플루언서의 수정 요청이 거부되는지 검증한다. */
    @Test
    void rejectsUpdateByNonAuthor() throws Exception {
        FanMemo memo = persistMemo(influencer, meeting, "원본 메모");
        entityManager.flush();
        entityManager.clear();

        mockMvc.perform(patch("/api/v1/fan-memos/" + memo.getId()).with(as(otherInfluencer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"침입 수정\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FAN_MEMO_ACCESS_DENIED"));

        entityManager.clear();
        assertThat(fanMemoRepository.findById(memo.getId()).orElseThrow().getContent())
                .isEqualTo("원본 메모");
    }

    /** 존재하지 않는 메모의 수정 요청이 거부되는지 검증한다. */
    @Test
    void rejectsUpdateOfMissingMemo() throws Exception {
        mockMvc.perform(patch("/api/v1/fan-memos/999999").with(as(influencer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"내용\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("FAN_MEMO_NOT_FOUND"));
    }

    /** 삭제 요청이 삭제 시각만 남기고 목록 조회에서 제외되는지 검증한다. */
    @Test
    void softDeletesMemoAndHidesItFromList() throws Exception {
        FanMemo memo = persistMemo(influencer, meeting, "삭제할 메모");
        entityManager.flush();
        entityManager.clear();

        mockMvc.perform(delete("/api/v1/fan-memos/" + memo.getId()).with(as(influencer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.memoId").value(memo.getId()))
                .andExpect(jsonPath("$.data.deleted").value(true))
                .andExpect(jsonPath("$.data.deletedAt").exists());

        entityManager.clear();
        FanMemo reloaded = fanMemoRepository.findById(memo.getId()).orElseThrow();
        assertThat(reloaded.getDeletedAt()).isNotNull();
        assertThat(reloaded.getContent()).isEqualTo("삭제할 메모");

        mockMvc.perform(get(memosUrl()).with(as(influencer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(0))
                .andExpect(jsonPath("$.data.content").isEmpty());
    }

    /** 이미 삭제된 메모의 재삭제 요청이 충돌로 거부되는지 검증한다. */
    @Test
    void rejectsSecondDeleteWithConflict() throws Exception {
        FanMemo memo = persistMemo(influencer, meeting, "삭제할 메모");
        entityManager.flush();
        entityManager.clear();

        mockMvc.perform(delete("/api/v1/fan-memos/" + memo.getId()).with(as(influencer)))
                .andExpect(status().isOk());
        entityManager.flush();
        entityManager.clear();

        mockMvc.perform(delete("/api/v1/fan-memos/" + memo.getId()).with(as(influencer)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("FAN_MEMO_ALREADY_DELETED"));
    }

    /** 같은 활성 조직 매니저가 조직 인플루언서의 메모를 조회할 수 있는지 검증한다. */
    @Test
    void allowsSameOrganizationManagerToReadMemos() throws Exception {
        persistMemo(influencer, meeting, "조직 인플루언서 메모");
        entityManager.flush();
        entityManager.clear();

        mockMvc.perform(get(memosUrl()).with(as(sameOrganizationManager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].content").value("조직 인플루언서 메모"))
                .andExpect(jsonPath("$.data.content[0].meetingTitle").value("7월 팬미팅"));
    }

    /** 다른 조직 매니저에게는 해당 메모가 노출되지 않는지 검증한다. */
    @Test
    void hidesMemosFromOtherOrganizationManager() throws Exception {
        persistMemo(influencer, meeting, "조직 인플루언서 메모");
        entityManager.flush();
        entityManager.clear();

        mockMvc.perform(get(memosUrl()).with(as(otherOrganizationManager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(0))
                .andExpect(jsonPath("$.data.content").isEmpty());
    }

    /** 소속 조직이 없는 매니저의 조회가 거부되는지 검증한다. */
    @Test
    void rejectsManagerWithoutOrganization() throws Exception {
        User looseManager = persistUser("memo-loose-manager", "무소속매니저", UserRole.MANAGER);
        persistMemo(influencer, meeting, "조직 인플루언서 메모");
        entityManager.flush();
        entityManager.clear();

        mockMvc.perform(get(memosUrl()).with(as(looseManager)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FAN_MEMO_ACCESS_DENIED"));
    }

    /** 다른 인플루언서가 같은 팬에게 남긴 메모가 내 목록에 섞이지 않는지 검증한다. */
    @Test
    void doesNotMixMemosOfOtherInfluencers() throws Exception {
        persistMemo(influencer, meeting, "내 메모");
        persistMemo(otherInfluencer, null, "다른 인플루언서 메모");
        entityManager.flush();
        entityManager.clear();

        mockMvc.perform(get(memosUrl()).with(as(influencer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].content").value("내 메모"));
    }

    /** 삭제되지 않은 메모가 작성 시각 내림차순으로 페이지 조회되는지 검증한다. */
    @Test
    void returnsMemosInLatestOrderWithPaging() throws Exception {
        FanMemo oldest = persistMemo(influencer, meeting, "가장 오래된 메모");
        FanMemo middle = persistMemo(influencer, meeting, "중간 메모");
        FanMemo newest = persistMemo(influencer, meeting, "가장 최근 메모");
        entityManager.flush();
        ReflectionTestUtils.setField(oldest, "createdAt", NOW.minusDays(3));
        ReflectionTestUtils.setField(middle, "createdAt", NOW.minusDays(2));
        ReflectionTestUtils.setField(newest, "createdAt", NOW.minusDays(1));
        entityManager.flush();
        entityManager.clear();

        mockMvc.perform(get(memosUrl() + "?page=0&size=2").with(as(influencer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.page").value(0))
                .andExpect(jsonPath("$.data.size").value(2))
                .andExpect(jsonPath("$.data.totalElements").value(3))
                .andExpect(jsonPath("$.data.totalPages").value(2))
                .andExpect(jsonPath("$.data.hasNext").value(true))
                .andExpect(jsonPath("$.data.content[0].content").value("가장 최근 메모"))
                .andExpect(jsonPath("$.data.content[1].content").value("중간 메모"));

        mockMvc.perform(get(memosUrl() + "?page=1&size=2").with(as(influencer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.hasNext").value(false))
                .andExpect(jsonPath("$.data.content[0].content").value("가장 오래된 메모"));
    }

    /** 상한을 넘는 페이지 크기 요청이 거부되는지 검증한다. */
    @Test
    void rejectsPageSizeOverLimit() throws Exception {
        mockMvc.perform(get(memosUrl() + "?page=0&size=101").with(as(influencer)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    /** 메모가 여러 건이어도 회차 제목 조회가 N+1로 늘어나지 않는지 실제 SQL 수로 검증한다. */
    @Test
    void readsMemoListWithoutNPlusOneQueries() throws Exception {
        for (int index = 0; index < 5; index++) {
            persistMemo(influencer, persistMeeting(sameOrganizationManager, influencer, null,
                    "회차 " + index), "메모 " + index);
        }
        entityManager.flush();
        entityManager.clear();

        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.clear();

        mockMvc.perform(get(memosUrl() + "?page=0&size=10").with(as(influencer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(5));

        // 사용자 조회 · 팬 조회 · 목록(회차 fetch 포함) · count 만 실행되어야 한다.
        assertThat(statistics.getPrepareStatementCount()).isLessThanOrEqualTo(5);
    }

    /** 메모 목록 API 경로를 만든다. */
    private String memosUrl() {
        return "/api/v1/influencers/me/fans/" + fan.getId() + "/memos";
    }

    /** 지정한 사용자를 JWT 인증 필터가 만든 것과 같은 형태의 인증 정보로 사용한다. */
    private RequestPostProcessor as(User user) {
        AuthenticatedUser principal = new AuthenticatedUser(user.getId(), user.getRole());
        return authentication(new UsernamePasswordAuthenticationToken(principal, null,
                List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()))));
    }

    /** 통합 테스트에 사용할 활성 사용자를 저장한다. */
    private User persistUser(String loginId, String nickname, UserRole role) {
        User user = User.createActive(loginId, loginId + "@melly.test", "encoded", nickname,
                role, PreferredLanguage.KOREAN);
        entityManager.persist(user);
        return user;
    }

    /** 통합 테스트에 사용할 활성 조직을 저장한다. */
    private Organization persistOrganization(String name) {
        Organization organization = BeanUtils.instantiateClass(Organization.class);
        ReflectionTestUtils.setField(organization, "name", name);
        ReflectionTestUtils.setField(organization, "status", "ACTIVE");
        entityManager.persist(organization);
        return organization;
    }

    /** 통합 테스트에 사용할 활성 조직 소속을 저장한다. */
    private void persistMembership(Organization organization, User user, OrganizationMemberType type) {
        entityManager.persist(OrganizationMember.join(organization, user, type, NOW));
    }

    /** 통합 테스트에 사용할 진행 중 팬미팅을 저장한다. */
    private FanMeeting persistMeeting(User manager, User influencerUser,
                                      Organization organization, String title) {
        FanMeeting fanMeeting = BeanUtils.instantiateClass(FanMeeting.class);
        ReflectionTestUtils.setField(fanMeeting, "organization", organization);
        ReflectionTestUtils.setField(fanMeeting, "manager", manager);
        ReflectionTestUtils.setField(fanMeeting, "influencer", influencerUser);
        ReflectionTestUtils.setField(fanMeeting, "title", title);
        ReflectionTestUtils.setField(fanMeeting, "status", FanMeetingStatus.LIVE);
        ReflectionTestUtils.setField(fanMeeting, "scheduledStartAt", NOW);
        entityManager.persist(fanMeeting);
        return fanMeeting;
    }

    /** 통합 테스트에 사용할 당첨 응모와 참가자를 저장한다. */
    private void persistParticipant(FanMeeting fanMeeting, User participantFan) {
        Application application = BeanUtils.instantiateClass(Application.class);
        ReflectionTestUtils.setField(application, "meeting", fanMeeting);
        ReflectionTestUtils.setField(application, "fan", participantFan);
        ReflectionTestUtils.setField(application, "status", ApplicationStatus.SELECTED);
        ReflectionTestUtils.setField(application, "personalInformationConsentAt", NOW);
        ReflectionTestUtils.setField(application, "submittedAt", NOW);
        entityManager.persist(application);

        Participant participant = BeanUtils.instantiateClass(Participant.class);
        ReflectionTestUtils.setField(participant, "meeting", fanMeeting);
        ReflectionTestUtils.setField(participant, "fan", participantFan);
        ReflectionTestUtils.setField(participant, "application", application);
        ReflectionTestUtils.setField(participant, "status", "READY");
        ReflectionTestUtils.setField(participant, "assignedOrder", 1);
        entityManager.persist(participant);
    }

    /** 통합 테스트에 사용할 팬 메모를 저장한다. */
    private FanMemo persistMemo(User author, FanMeeting fanMeeting, String content) {
        FanMemo memo = FanMemo.create(author, fan, fanMeeting, content);
        entityManager.persist(memo);
        return memo;
    }
}
