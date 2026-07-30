package com.ssafy.backend.participant.controller;

import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.application.domain.ApplicationStatus;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:participant-api;MODE=MySQL;DB_CLOSE_DELAY=-1",
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
class FanMeetingParticipantApiIntegrationTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 7, 30, 15, 0);

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    private User manager;
    private User influencer;
    private FanMeeting meeting;
    private List<Participant> participants;

    /** 매니저·인플루언서와 참가자 3명, 대기열 2건을 가진 팬미팅을 준비한다. */
    @BeforeEach
    void setUp() {
        manager = persistUser("api-manager", "테스트매니저", UserRole.MANAGER);
        influencer = persistUser("api-influencer", "테스트인플루언서", UserRole.INFLUENCER);
        meeting = persistMeeting("참가자 조회 통합 테스트 팬미팅");
        participants = List.of(
                persistParticipant(meeting, persistUser("api-fan1", "가나다팬", UserRole.FAN),
                        "READY", 1),
                persistParticipant(meeting, persistUser("api-fan2", "라마바팬", UserRole.FAN),
                        "READY", 2),
                persistParticipant(meeting, persistUser("api-fan3", "사아자팬", UserRole.FAN),
                        "CANCELED", 3)
        );
        persistQueueEntry(participants.get(0), 1, QueueEntryStatus.IN_CALL);
        persistQueueEntry(participants.get(1), 2, QueueEntryStatus.DONE);
        entityManager.flush();
        entityManager.clear();
    }

    /** 담당 매니저가 참가자 전체를 배정 순번대로 조회하고 대기열 상태가 함께 노출되는지 검증한다. */
    @Test
    void returnsParticipantsInAssignedOrderWithQueueStatus() throws Exception {
        mockMvc.perform(get(participantsUrl()).with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.totalElements").value(3))
                .andExpect(jsonPath("$.data.totalPages").value(1))
                .andExpect(jsonPath("$.data.hasNext").value(false))
                .andExpect(jsonPath("$.data.content[0].nickname").value("가나다팬"))
                .andExpect(jsonPath("$.data.content[0].callOrder").value(1))
                .andExpect(jsonPath("$.data.content[0].participantStatus").value("READY"))
                .andExpect(jsonPath("$.data.content[0].queueStatus").value("IN_CALL"))
                .andExpect(jsonPath("$.data.content[1].queueStatus").value("COMPLETED"))
                .andExpect(jsonPath("$.data.content[2].nickname").value("사아자팬"))
                .andExpect(jsonPath("$.data.content[2].participantStatus").value("CANCELED"))
                .andExpect(jsonPath("$.data.content[2].queueStatus").doesNotExist());
    }

    /** 배정 인플루언서도 같은 참가자 목록을 조회할 수 있는지 검증한다. */
    @Test
    void allowsAssignedInfluencerToReadParticipants() throws Exception {
        mockMvc.perform(get(participantsUrl()).with(as(influencer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(3));
    }

    /** 응답의 대기열 상태가 실제 대기열 테이블의 상태와 일치하는지 검증한다. */
    @Test
    void matchesQueueStatusWithStoredQueueEntries() throws Exception {
        QueueEntry stored = entityManager.createQuery(
                        "select q from QueueEntry q where q.participant.id = :participantId",
                        QueueEntry.class)
                .setParameter("participantId", participants.get(0).getId())
                .getSingleResult();
        assertThat(stored.getStatus()).isEqualTo(QueueEntryStatus.IN_CALL);

        mockMvc.perform(get(participantsUrl()).with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].queueStatus")
                        .value(stored.getStatus().name()));
    }

    /** 참가자 상태 필터가 적용되는지 검증한다. */
    @Test
    void filtersParticipantsByStatus() throws Exception {
        mockMvc.perform(get(participantsUrl()).param("participantStatus", "CANCELED")
                        .with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].nickname").value("사아자팬"));
    }

    /** 닉네임 검색어가 부분 일치로 적용되는지 검증한다. */
    @Test
    void filtersParticipantsByKeyword() throws Exception {
        mockMvc.perform(get(participantsUrl()).param("keyword", "라마").with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].nickname").value("라마바팬"));
    }

    /** 일치하는 닉네임이 없으면 빈 목록을 반환하는지 검증한다. */
    @Test
    void returnsEmptyContentWhenKeywordDoesNotMatch() throws Exception {
        mockMvc.perform(get(participantsUrl()).param("keyword", "존재하지않는닉네임")
                        .with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isEmpty())
                .andExpect(jsonPath("$.data.totalElements").value(0));
    }

    /** 참가자가 한 명도 없는 팬미팅에서 빈 목록을 반환하는지 검증한다. */
    @Test
    void returnsEmptyContentWhenMeetingHasNoParticipant() throws Exception {
        FanMeeting emptyMeeting = persistMeeting("참가자 없는 팬미팅");
        entityManager.flush();

        mockMvc.perform(get("/api/v1/fan-meetings/" + emptyMeeting.getId() + "/participants")
                        .with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isEmpty())
                .andExpect(jsonPath("$.data.totalElements").value(0))
                .andExpect(jsonPath("$.data.totalPages").value(0))
                .andExpect(jsonPath("$.data.hasNext").value(false));
    }

    /** 페이지 크기 1로 나눠 조회할 때 페이지 정보가 올바른지 검증한다. */
    @Test
    void paginatesWithMinimumPageSize() throws Exception {
        mockMvc.perform(get(participantsUrl()).param("size", "1").param("page", "0")
                        .with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.size").value(1))
                .andExpect(jsonPath("$.data.totalPages").value(3))
                .andExpect(jsonPath("$.data.hasNext").value(true))
                .andExpect(jsonPath("$.data.content[0].callOrder").value(1));

        mockMvc.perform(get(participantsUrl()).param("size", "1").param("page", "2")
                        .with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.page").value(2))
                .andExpect(jsonPath("$.data.hasNext").value(false))
                .andExpect(jsonPath("$.data.content[0].callOrder").value(3));
    }

    /** 프론트엔드 기본 페이지 크기 6과 최대 허용 크기 100이 허용되는지 검증한다. */
    @Test
    void acceptsBoundaryPageSizes() throws Exception {
        mockMvc.perform(get(participantsUrl()).param("size", "6").with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.size").value(6));
        mockMvc.perform(get(participantsUrl()).param("size", "100").with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.size").value(100));
    }

    /** 허용 범위를 넘는 페이지 크기와 음수 페이지 번호가 거부되는지 검증한다. */
    @Test
    void rejectsOutOfRangePageValues() throws Exception {
        mockMvc.perform(get(participantsUrl()).param("size", "101").with(as(manager)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        mockMvc.perform(get(participantsUrl()).param("page", "-1").with(as(manager)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    /** 담당하지 않는 매니저의 참가자 목록 조회가 거부되는지 검증한다. */
    @Test
    void rejectsManagerOfAnotherMeeting() throws Exception {
        User otherManager = persistUser("api-other-manager", "다른매니저", UserRole.MANAGER);
        entityManager.flush();

        mockMvc.perform(get(participantsUrl()).with(as(otherManager)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
    }

    /** 존재하지 않는 팬미팅의 참가자 목록 조회가 거부되는지 검증한다. */
    @Test
    void rejectsMissingMeeting() throws Exception {
        mockMvc.perform(get("/api/v1/fan-meetings/999999/participants").with(as(manager)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("FAN_MEETING_NOT_FOUND"));
    }

    /** 참가자 상세 조회가 목록과 같은 필드를 반환하는지 검증한다. */
    @Test
    void returnsParticipantDetail() throws Exception {
        Participant target = participants.get(1);

        mockMvc.perform(get(participantsUrl() + "/" + target.getId()).with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.participantId").value(target.getId()))
                .andExpect(jsonPath("$.data.nickname").value("라마바팬"))
                .andExpect(jsonPath("$.data.callOrder").value(2))
                .andExpect(jsonPath("$.data.participantStatus").value("READY"))
                .andExpect(jsonPath("$.data.queueStatus").value("COMPLETED"));
    }

    /** 대기열 항목이 없는 참가자의 상세 응답에 대기열 상태가 없는지 검증한다. */
    @Test
    void returnsDetailWithoutQueueStatusWhenQueueEntryMissing() throws Exception {
        Participant target = participants.get(2);

        mockMvc.perform(get(participantsUrl() + "/" + target.getId()).with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.queueStatus").doesNotExist());
    }

    /** 다른 팬미팅에 속한 참가자 식별자로 상세 조회하면 거부되는지 검증한다. */
    @Test
    void rejectsParticipantOfAnotherMeeting() throws Exception {
        FanMeeting otherMeeting = persistMeeting("다른 팬미팅");
        Participant otherParticipant = persistParticipant(otherMeeting,
                persistUser("api-fan9", "다른팬", UserRole.FAN), "READY", 1);
        entityManager.flush();

        mockMvc.perform(get(participantsUrl() + "/" + otherParticipant.getId()).with(as(manager)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PARTICIPANT_NOT_IN_MEETING"));
    }

    /** 존재하지 않는 참가자 식별자로 상세 조회하면 거부되는지 검증한다. */
    @Test
    void rejectsMissingParticipant() throws Exception {
        mockMvc.perform(get(participantsUrl() + "/999999").with(as(manager)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PARTICIPANT_NOT_IN_MEETING"));
    }

    /** 참가자 수가 늘어도 실행되는 SQL 수가 늘지 않는지 실제 실행 통계로 검증한다. */
    @Test
    void doesNotIssueQueryPerParticipant() throws Exception {
        FanMeeting largeMeeting = persistMeeting("참가자가 많은 팬미팅");
        for (int index = 1; index <= 8; index++) {
            Participant participant = persistParticipant(largeMeeting,
                    persistUser("api-large-fan" + index, "대규모팬" + index, UserRole.FAN),
                    "READY", index);
            persistQueueEntry(participant, index, QueueEntryStatus.WAITING);
        }
        entityManager.flush();
        entityManager.clear();

        long smallMeetingQueries = countQueries(meeting.getId());
        long largeMeetingQueries = countQueries(largeMeeting.getId());

        assertThat(smallMeetingQueries).isPositive();
        assertThat(largeMeetingQueries).isEqualTo(smallMeetingQueries);
    }

    /**
     * 참가자 목록을 조회하면서 실행된 SQL 문 수를 센다.
     *
     * @param meetingId 조회할 팬미팅 식별자
     * @return 조회 중 실행된 SQL 문 수
     * @throws Exception 요청 처리에 실패한 경우
     */
    private long countQueries(Long meetingId) throws Exception {
        entityManager.clear();
        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.clear();
        mockMvc.perform(get("/api/v1/fan-meetings/" + meetingId + "/participants")
                        .param("size", "100").with(as(manager)))
                .andExpect(status().isOk());
        return statistics.getPrepareStatementCount();
    }

    /** 참가자 목록 API 경로를 만든다. */
    private String participantsUrl() {
        return "/api/v1/fan-meetings/" + meeting.getId() + "/participants";
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

    /** 통합 테스트에 사용할 진행 중 팬미팅을 저장한다. */
    private FanMeeting persistMeeting(String title) {
        FanMeeting meeting = BeanUtils.instantiateClass(FanMeeting.class);
        ReflectionTestUtils.setField(meeting, "manager", manager);
        ReflectionTestUtils.setField(meeting, "influencer", influencer);
        ReflectionTestUtils.setField(meeting, "title", title);
        ReflectionTestUtils.setField(meeting, "status", FanMeetingStatus.LIVE);
        ReflectionTestUtils.setField(meeting, "scheduledStartAt", NOW);
        entityManager.persist(meeting);
        return meeting;
    }

    /** 통합 테스트에 사용할 당첨 응모와 참가자를 저장한다. */
    private Participant persistParticipant(FanMeeting meeting, User fan, String status,
                                           int assignedOrder) {
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
        ReflectionTestUtils.setField(participant, "status", status);
        ReflectionTestUtils.setField(participant, "assignedOrder", assignedOrder);
        entityManager.persist(participant);
        return participant;
    }

    /** 통합 테스트에 사용할 대기열 항목을 저장한다. */
    private void persistQueueEntry(Participant participant, int position,
                                   QueueEntryStatus status) {
        QueueEntry entry = BeanUtils.instantiateClass(QueueEntry.class);
        ReflectionTestUtils.setField(entry, "meeting", participant.getMeeting());
        ReflectionTestUtils.setField(entry, "participant", participant);
        ReflectionTestUtils.setField(entry, "queuePosition", position);
        ReflectionTestUtils.setField(entry, "status", status);
        ReflectionTestUtils.setField(entry, "recallCount", 0);
        entityManager.persist(entry);
    }
}
