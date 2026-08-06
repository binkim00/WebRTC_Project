package com.ssafy.backend.meeting.controller;

import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.application.domain.ApplicationStatus;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.call.domain.CallEndReason;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.domain.CallSessionStatus;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import com.ssafy.backend.meeting.domain.MeetingOperationSetting;
import com.ssafy.backend.notification.domain.Notification;
import com.ssafy.backend.notification.domain.NotificationType;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import jakarta.persistence.EntityManager;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 팬미팅 공개·삭제·취소, 내 팬미팅 목록, 결과 통계 API를 실제 웹 계층으로 검증한다.
 *
 * <p>SecurityConfig의 URL 역할 규칙과 공통 예외 변환을 모두 통과하는 요청으로 확인하고,
 * 상태 전이 결과는 영속성 컨텍스트를 비운 뒤 다시 읽어 저장 값까지 검증한다.
 */
@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:meeting-lifecycle;MODE=MySQL;DB_CLOSE_DELAY=-1",
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
class FanMeetingLifecycleApiIntegrationTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 7, 30, 15, 0);

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private EntityManager entityManager;

    private User manager;
    private User influencer;
    private User otherManager;
    private User fan;
    private FanMeeting draftMeeting;
    private FanMeeting publishedMeeting;
    private FanMeeting endedMeeting;

    /** 담당자·팬 계정과 초안·공개·종료 팬미팅, 종료 팬미팅의 집계 원본 데이터를 준비한다. */
    @BeforeEach
    void setUp() {
        manager = persistUser("life-manager", "테스트매니저", UserRole.MANAGER);
        influencer = persistUser("life-influencer", "테스트인플루언서", UserRole.INFLUENCER);
        otherManager = persistUser("life-other-manager", "다른매니저", UserRole.MANAGER);
        fan = persistUser("life-fan", "테스트팬", UserRole.FAN);

        draftMeeting = persistMeeting("초안 팬미팅", FanMeetingStatus.DRAFT);
        publishedMeeting = persistMeeting("공개 팬미팅", FanMeetingStatus.PUBLISHED);
        endedMeeting = persistMeeting("종료 팬미팅", FanMeetingStatus.ENDED);

        persistApplication(publishedMeeting, fan, ApplicationStatus.SUBMITTED);

        Participant first = persistSelectedParticipant(endedMeeting,
                persistUser("life-fan1", "당첨팬1", UserRole.FAN), 1);
        Participant second = persistSelectedParticipant(endedMeeting,
                persistUser("life-fan2", "당첨팬2", UserRole.FAN), 2);
        persistApplication(endedMeeting, persistUser("life-fan3", "미당첨팬", UserRole.FAN),
                ApplicationStatus.NOT_SELECTED);
        persistApplication(endedMeeting, persistUser("life-fan4", "취소팬", UserRole.FAN),
                ApplicationStatus.WITHDRAWN);

        QueueEntry doneEntry = persistQueueEntry(first, 1, QueueEntryStatus.DONE);
        persistQueueEntry(second, 2, QueueEntryStatus.NO_SHOW);
        persistEndedCallSession(doneEntry, 120L);
        persistFailedCallSession(persistQueueEntry(persistSelectedParticipant(endedMeeting,
                persistUser("life-fan5", "연결실패팬", UserRole.FAN), 3),
                3, QueueEntryStatus.REMOVED));

        entityManager.flush();
        entityManager.clear();
    }

    /** 초안 팬미팅 공개가 상태를 전환하고 공개 목록에 노출되는지 검증한다. */
    @Test
    void publishesDraftMeetingAndExposesItInPublicList() throws Exception {
        mockMvc.perform(post(meetingUrl(draftMeeting) + "/publish").with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.meetingId").value(draftMeeting.getId()))
                .andExpect(jsonPath("$.data.status").value("PUBLISHED"))
                .andExpect(jsonPath("$.data.publishedAt").isNotEmpty());

        assertThat(reload(draftMeeting).getStatus()).isEqualTo(FanMeetingStatus.PUBLISHED);
        assertThat(reload(draftMeeting).getPublishedAt()).isNotNull();

        mockMvc.perform(get("/api/v1/fan-meetings").param("keyword", "초안 팬미팅"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].meetingId").value(draftMeeting.getId()))
                .andExpect(jsonPath("$.data.content[0].status").value("PUBLISHED"));
    }

    /** 공개 전 초안 팬미팅이 공개 목록에 노출되지 않는지 검증한다. */
    @Test
    void hidesDraftMeetingFromPublicListBeforePublish() throws Exception {
        mockMvc.perform(get("/api/v1/fan-meetings").param("keyword", "초안 팬미팅"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(0));
    }

    /** 이미 공개된 팬미팅의 재공개 요청이 상태 충돌로 거부되는지 검증한다. */
    @Test
    void rejectsPublishForAlreadyPublishedMeeting() throws Exception {
        mockMvc.perform(post(meetingUrl(publishedMeeting) + "/publish").with(as(manager)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("FAN_MEETING_STATE_CONFLICT"));
    }

    /** 담당자가 아닌 매니저의 공개 요청이 권한 오류로 거부되는지 검증한다. */
    @Test
    void rejectsPublishFromOtherManager() throws Exception {
        mockMvc.perform(post(meetingUrl(draftMeeting) + "/publish").with(as(otherManager)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        assertThat(reload(draftMeeting).getStatus()).isEqualTo(FanMeetingStatus.DRAFT);
    }

    /** 존재하지 않는 팬미팅의 공개 요청이 조회 실패로 거부되는지 검증한다. */
    @Test
    void rejectsPublishForMissingMeeting() throws Exception {
        mockMvc.perform(post("/api/v1/fan-meetings/999999/publish").with(as(manager)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("FAN_MEETING_NOT_FOUND"));
    }

    /** 인증 없는 공개 요청이 인증 오류로 거부되는지 검증한다. */
    @Test
    void rejectsPublishWithoutAuthentication() throws Exception {
        mockMvc.perform(post(meetingUrl(draftMeeting) + "/publish"))
                .andExpect(status().isUnauthorized());
    }

    /** 초안 팬미팅 삭제가 삭제 시각을 저장하고 조회에서 숨겨지는지 검증한다. */
    @Test
    void deletesDraftMeetingAndHidesItFromQueries() throws Exception {
        mockMvc.perform(delete(meetingUrl(draftMeeting)).with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.deletedAt").isNotEmpty());

        assertThat(reload(draftMeeting).getDeletedAt()).isNotNull();

        mockMvc.perform(get(meetingUrl(draftMeeting)).with(as(manager)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("FAN_MEETING_NOT_FOUND"));

        mockMvc.perform(get("/api/v1/users/me/fan-meetings").with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(2));
    }

    /** 공개된 팬미팅의 삭제 요청이 상태 충돌로 거부되는지 검증한다. */
    @Test
    void rejectsDeleteForPublishedMeeting() throws Exception {
        mockMvc.perform(delete(meetingUrl(publishedMeeting)).with(as(manager)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("FAN_MEETING_STATE_CONFLICT"));

        assertThat(reload(publishedMeeting).getDeletedAt()).isNull();
    }

    /** 담당자가 아닌 매니저의 삭제 요청이 권한 오류로 거부되는지 검증한다. */
    @Test
    void rejectsDeleteFromOtherManager() throws Exception {
        mockMvc.perform(delete(meetingUrl(draftMeeting)).with(as(otherManager)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        assertThat(reload(draftMeeting).getDeletedAt()).isNull();
    }

    /** 존재하지 않는 팬미팅의 삭제 요청이 조회 실패로 거부되는지 검증한다. */
    @Test
    void rejectsDeleteForMissingMeeting() throws Exception {
        mockMvc.perform(delete("/api/v1/fan-meetings/999999").with(as(manager)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("FAN_MEETING_NOT_FOUND"));
    }

    /** 공개 팬미팅 취소가 취소 상태를 저장하고 응모자 알림을 생성하는지 검증한다. */
    @Test
    void cancelsPublishedMeetingAndStoresCanceledStatus() throws Exception {
        mockMvc.perform(post(meetingUrl(publishedMeeting) + "/cancel").with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CANCELED"))
                .andExpect(jsonPath("$.data.canceledAt").isNotEmpty());

        FanMeeting stored = reload(publishedMeeting);
        assertThat(stored.getStatus()).isEqualTo(FanMeetingStatus.CANCELED);
        assertThat(stored.getCanceledAt()).isNotNull();

        List<Notification> notifications = entityManager.createQuery(
                        "select n from Notification n where n.meeting.id = :meetingId",
                        Notification.class)
                .setParameter("meetingId", publishedMeeting.getId())
                .getResultList();
        assertThat(notifications).hasSize(1);
        assertThat(notifications.get(0).getType()).isEqualTo(NotificationType.MEETING_CANCELED);
        assertThat(notifications.get(0).getUser().getId()).isEqualTo(fan.getId());
    }

    /** 취소된 팬미팅이 공개 목록에서 제외되는지 검증한다. */
    @Test
    void hidesCanceledMeetingFromPublicList() throws Exception {
        mockMvc.perform(post(meetingUrl(publishedMeeting) + "/cancel").with(as(manager)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/fan-meetings").param("keyword", "공개 팬미팅"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(0));
    }

    /** 아직 공개하지 않은 초안 팬미팅의 취소 요청이 상태 충돌로 거부되는지 검증한다. */
    @Test
    void rejectsCancelForDraftMeeting() throws Exception {
        mockMvc.perform(post(meetingUrl(draftMeeting) + "/cancel").with(as(manager)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("FAN_MEETING_STATE_CONFLICT"));

        assertThat(reload(draftMeeting).getStatus()).isEqualTo(FanMeetingStatus.DRAFT);
    }

    /** 이미 종료된 팬미팅의 취소 요청이 상태 충돌로 거부되는지 검증한다. */
    @Test
    void rejectsCancelForEndedMeeting() throws Exception {
        mockMvc.perform(post(meetingUrl(endedMeeting) + "/cancel").with(as(manager)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("FAN_MEETING_STATE_CONFLICT"));
    }

    /** 담당자가 아닌 매니저의 취소 요청이 권한 오류로 거부되는지 검증한다. */
    @Test
    void rejectsCancelFromOtherManager() throws Exception {
        mockMvc.perform(post(meetingUrl(publishedMeeting) + "/cancel").with(as(otherManager)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        assertThat(reload(publishedMeeting).getStatus()).isEqualTo(FanMeetingStatus.PUBLISHED);
    }

    /** 존재하지 않는 팬미팅의 취소 요청이 조회 실패로 거부되는지 검증한다. */
    @Test
    void rejectsCancelForMissingMeeting() throws Exception {
        mockMvc.perform(post("/api/v1/fan-meetings/999999/cancel").with(as(manager)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("FAN_MEETING_NOT_FOUND"));
    }

    /** 매니저의 내 팬미팅 목록이 담당 팬미팅 전체를 최신 일정순으로 반환하는지 검증한다. */
    @Test
    void listsMyMeetingsForManager() throws Exception {
        mockMvc.perform(get("/api/v1/users/me/fan-meetings").with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.totalElements").value(3))
                .andExpect(jsonPath("$.data.content[0].influencerName")
                        .value("테스트인플루언서"));
    }

    /** 인플루언서의 내 팬미팅 목록이 자신이 진행하는 팬미팅을 반환하는지 검증한다. */
    @Test
    void listsMyMeetingsForInfluencer() throws Exception {
        mockMvc.perform(get("/api/v1/users/me/fan-meetings").with(as(influencer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(3));
    }

    /** 담당 팬미팅이 없는 매니저에게 빈 목록을 반환하는지 검증한다. */
    @Test
    void returnsEmptyMyMeetingsForManagerWithoutMeetings() throws Exception {
        mockMvc.perform(get("/api/v1/users/me/fan-meetings").with(as(otherManager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isEmpty())
                .andExpect(jsonPath("$.data.totalElements").value(0))
                .andExpect(jsonPath("$.data.totalPages").value(0))
                .andExpect(jsonPath("$.data.hasNext").value(false));
    }

    /** 내 팬미팅 목록의 상태 필터가 적용되는지 검증한다. */
    @Test
    void filtersMyMeetingsByStatus() throws Exception {
        mockMvc.perform(get("/api/v1/users/me/fan-meetings").param("status", "ENDED")
                        .with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].meetingId").value(endedMeeting.getId()))
                .andExpect(jsonPath("$.data.content[0].status").value("ENDED"));
    }

    /** 내 팬미팅 목록의 응모 수·참가자 수가 저장된 행 수와 일치하는지 검증한다. */
    @Test
    void countsApplicationsAndParticipantsInMyMeetings() throws Exception {
        mockMvc.perform(get("/api/v1/users/me/fan-meetings").param("status", "ENDED")
                        .with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].applicationCount").value(4))
                .andExpect(jsonPath("$.data.content[0].participantCount").value(3));
    }

    /** 잘못된 상태 필터 값의 내 팬미팅 목록 요청이 거부되는지 검증한다. */
    @Test
    void rejectsMyMeetingsWithInvalidStatusFilter() throws Exception {
        mockMvc.perform(get("/api/v1/users/me/fan-meetings").param("status", "UNKNOWN")
                        .with(as(manager)))
                .andExpect(status().isBadRequest());
    }

    /** 허용 범위를 벗어난 페이지 크기의 내 팬미팅 목록 요청이 거부되는지 검증한다. */
    @Test
    void rejectsMyMeetingsWithOutOfRangePageSize() throws Exception {
        mockMvc.perform(get("/api/v1/users/me/fan-meetings").param("size", "101")
                        .with(as(manager)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    /** 팬 역할 사용자의 내 팬미팅 목록 요청이 권한 오류로 거부되는지 검증한다. */
    @Test
    void rejectsMyMeetingsForFanRole() throws Exception {
        mockMvc.perform(get("/api/v1/users/me/fan-meetings").with(as(fan)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
    }

    /** 인증 없는 내 팬미팅 목록 요청이 인증 오류로 거부되는지 검증한다. */
    @Test
    void rejectsMyMeetingsWithoutAuthentication() throws Exception {
        mockMvc.perform(get("/api/v1/users/me/fan-meetings"))
                .andExpect(status().isUnauthorized());
    }

    /** 결과 통계 여덟 필드가 저장된 원본 행 수와 일치하는지 검증한다. */
    @Test
    void returnsStatisticsMatchingStoredRows() throws Exception {
        long applicationCount = countApplications(endedMeeting, null);
        long selectedCount = countApplications(endedMeeting, ApplicationStatus.SELECTED);
        long participantCount = countParticipants(endedMeeting);
        long noShowCount = countQueueEntries(endedMeeting, QueueEntryStatus.NO_SHOW);
        long endedCallCount = countCallSessions(endedMeeting, CallSessionStatus.ENDED);
        long failedCallCount = countCallSessions(endedMeeting, CallSessionStatus.FAILED);

        assertThat(applicationCount).isEqualTo(4L);
        assertThat(selectedCount).isEqualTo(3L);
        assertThat(participantCount).isEqualTo(3L);
        assertThat(noShowCount).isEqualTo(1L);
        assertThat(endedCallCount).isEqualTo(1L);
        assertThat(failedCallCount).isEqualTo(1L);

        mockMvc.perform(get(meetingUrl(endedMeeting) + "/statistics").with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.applicationCount").value(applicationCount))
                .andExpect(jsonPath("$.data.selectedCount").value(selectedCount))
                .andExpect(jsonPath("$.data.participantCount").value(participantCount))
                .andExpect(jsonPath("$.data.completedCallCount").value(endedCallCount))
                .andExpect(jsonPath("$.data.noShowCount").value(noShowCount))
                .andExpect(jsonPath("$.data.failedCallCount").value(failedCallCount))
                .andExpect(jsonPath("$.data.averageCallDurationSec").value(120))
                .andExpect(jsonPath("$.data.totalMeetingDurationSec").value(120));
    }

    /** 응모·참가·통화 데이터가 없는 팬미팅의 통계가 0으로 반환되는지 검증한다. */
    @Test
    void returnsZeroStatisticsForMeetingWithoutData() throws Exception {
        mockMvc.perform(get(meetingUrl(draftMeeting) + "/statistics").with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.applicationCount").value(0))
                .andExpect(jsonPath("$.data.selectedCount").value(0))
                .andExpect(jsonPath("$.data.participantCount").value(0))
                .andExpect(jsonPath("$.data.completedCallCount").value(0))
                .andExpect(jsonPath("$.data.noShowCount").value(0))
                .andExpect(jsonPath("$.data.failedCallCount").value(0))
                .andExpect(jsonPath("$.data.averageCallDurationSec").value(0))
                .andExpect(jsonPath("$.data.totalMeetingDurationSec").value(0));
    }

    /** 진행 인플루언서도 같은 결과 통계를 조회할 수 있는지 검증한다. */
    @Test
    void allowsAssignedInfluencerToReadStatistics() throws Exception {
        mockMvc.perform(get(meetingUrl(endedMeeting) + "/statistics").with(as(influencer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.completedCallCount").value(1));
    }

    /** 팬 역할 사용자의 결과 통계 요청이 URL 역할 규칙으로 거부되는지 검증한다. */
    @Test
    void rejectsStatisticsForFanRole() throws Exception {
        mockMvc.perform(get(meetingUrl(endedMeeting) + "/statistics").with(as(fan)))
                .andExpect(status().isForbidden());
    }

    /** 담당자가 아닌 매니저의 결과 통계 요청이 권한 오류로 거부되는지 검증한다. */
    @Test
    void rejectsStatisticsFromOtherManager() throws Exception {
        mockMvc.perform(get(meetingUrl(endedMeeting) + "/statistics").with(as(otherManager)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
    }

    /** 존재하지 않는 팬미팅의 결과 통계 요청이 조회 실패로 거부되는지 검증한다. */
    @Test
    void rejectsStatisticsForMissingMeeting() throws Exception {
        mockMvc.perform(get("/api/v1/fan-meetings/999999/statistics").with(as(manager)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("FAN_MEETING_NOT_FOUND"));
    }

    /** 삭제된 팬미팅의 결과 통계 요청이 조회 실패로 거부되는지 검증한다. */
    @Test
    void rejectsStatisticsForDeletedMeeting() throws Exception {
        mockMvc.perform(delete(meetingUrl(draftMeeting)).with(as(manager)))
                .andExpect(status().isOk());
        entityManager.flush();
        entityManager.clear();

        mockMvc.perform(get(meetingUrl(draftMeeting) + "/statistics").with(as(manager)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("FAN_MEETING_NOT_FOUND"));
    }

    /** 인증 없는 결과 통계 요청이 인증 오류로 거부되는지 검증한다. */
    @Test
    void rejectsStatisticsWithoutAuthentication() throws Exception {
        mockMvc.perform(get(meetingUrl(endedMeeting) + "/statistics"))
                .andExpect(status().isUnauthorized());
    }

    /** 영속성 컨텍스트를 비운 뒤 저장된 팬미팅을 다시 읽는다. */
    private FanMeeting reload(FanMeeting meeting) {
        entityManager.flush();
        entityManager.clear();
        return entityManager.find(FanMeeting.class, meeting.getId());
    }

    /** 팬미팅의 응모 수를 상태 조건과 함께 센다. */
    private long countApplications(FanMeeting meeting, ApplicationStatus status) {
        if (status == null) {
            return entityManager.createQuery("select count(a) from Application a "
                            + "where a.meeting.id = :meetingId and a.status <> :excluded", Long.class)
                    .setParameter("meetingId", meeting.getId())
                    .setParameter("excluded", ApplicationStatus.WITHDRAWN)
                    .getSingleResult();
        }
        return entityManager.createQuery("select count(a) from Application a "
                        + "where a.meeting.id = :meetingId and a.status = :status", Long.class)
                .setParameter("meetingId", meeting.getId())
                .setParameter("status", status)
                .getSingleResult();
    }

    /** 팬미팅의 확정 참가자 수를 센다. */
    private long countParticipants(FanMeeting meeting) {
        return entityManager.createQuery("select count(p) from Participant p "
                        + "where p.meeting.id = :meetingId", Long.class)
                .setParameter("meetingId", meeting.getId())
                .getSingleResult();
    }

    /** 팬미팅의 지정 상태 대기열 항목 수를 센다. */
    private long countQueueEntries(FanMeeting meeting, QueueEntryStatus status) {
        return entityManager.createQuery("select count(q) from QueueEntry q "
                        + "where q.meeting.id = :meetingId and q.status = :status", Long.class)
                .setParameter("meetingId", meeting.getId())
                .setParameter("status", status)
                .getSingleResult();
    }

    /** 팬미팅의 지정 상태 영상통화 세션 수를 센다. */
    private long countCallSessions(FanMeeting meeting, CallSessionStatus status) {
        return entityManager.createQuery("select count(c) from CallSession c "
                        + "where c.queueEntry.meeting.id = :meetingId and c.status = :status",
                        Long.class)
                .setParameter("meetingId", meeting.getId())
                .setParameter("status", status)
                .getSingleResult();
    }

    /** 팬미팅 관리 API의 기본 경로를 만든다. */
    private String meetingUrl(FanMeeting meeting) {
        return "/api/v1/fan-meetings/" + meeting.getId();
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

    /**
     * 지정한 상태의 팬미팅과 응모·운영 설정을 함께 저장한다.
     *
     * @param title 팬미팅 제목
     * @param status 저장할 팬미팅 상태
     * @return 저장된 팬미팅
     */
    private FanMeeting persistMeeting(String title, FanMeetingStatus status) {
        FanMeeting meeting = BeanUtils.instantiateClass(FanMeeting.class);
        ReflectionTestUtils.setField(meeting, "manager", manager);
        ReflectionTestUtils.setField(meeting, "influencer", influencer);
        ReflectionTestUtils.setField(meeting, "title", title);
        ReflectionTestUtils.setField(meeting, "status", status);
        ReflectionTestUtils.setField(meeting, "scheduledStartAt", NOW.plusDays(10));
        if (status != FanMeetingStatus.DRAFT) {
            ReflectionTestUtils.setField(meeting, "publishedAt", NOW.minusDays(1));
        }
        entityManager.persist(meeting);
        entityManager.persist(MeetingApplicationSetting.create(
                meeting, true, NOW.plusDays(1), NOW.plusDays(2), NOW.plusDays(3), 10));
        entityManager.persist(MeetingOperationSetting.create(
                meeting, NOW.plusDays(9), 120, false, true, 60, 30, 1));
        return meeting;
    }

    /** 지정한 상태의 응모를 저장한다. */
    private Application persistApplication(FanMeeting meeting, User applicant,
                                           ApplicationStatus status) {
        Application application = BeanUtils.instantiateClass(Application.class);
        ReflectionTestUtils.setField(application, "meeting", meeting);
        ReflectionTestUtils.setField(application, "fan", applicant);
        ReflectionTestUtils.setField(application, "status", status);
        ReflectionTestUtils.setField(application, "personalInformationConsentAt", NOW);
        ReflectionTestUtils.setField(application, "submittedAt", NOW);
        entityManager.persist(application);
        return application;
    }

    /** 당첨 응모와 확정 참가자를 함께 저장한다. */
    private Participant persistSelectedParticipant(FanMeeting meeting, User selectedFan,
                                                   int assignedOrder) {
        Application application =
                persistApplication(meeting, selectedFan, ApplicationStatus.SELECTED);
        Participant participant = BeanUtils.instantiateClass(Participant.class);
        ReflectionTestUtils.setField(participant, "meeting", meeting);
        ReflectionTestUtils.setField(participant, "fan", selectedFan);
        ReflectionTestUtils.setField(participant, "application", application);
        ReflectionTestUtils.setField(participant, "status", "READY");
        ReflectionTestUtils.setField(participant, "assignedOrder", assignedOrder);
        entityManager.persist(participant);
        return participant;
    }

    /** 지정한 상태의 대기열 항목을 저장한다. */
    private QueueEntry persistQueueEntry(Participant participant, int position,
                                         QueueEntryStatus status) {
        QueueEntry entry = BeanUtils.instantiateClass(QueueEntry.class);
        ReflectionTestUtils.setField(entry, "meeting", participant.getMeeting());
        ReflectionTestUtils.setField(entry, "participant", participant);
        ReflectionTestUtils.setField(entry, "queuePosition", position);
        ReflectionTestUtils.setField(entry, "status", status);
        ReflectionTestUtils.setField(entry, "recallCount", 0);
        entityManager.persist(entry);
        return entry;
    }

    /**
     * 지정한 통화 시간을 가진 정상 종료 영상통화 세션을 저장한다.
     *
     * @param entry 통화 대상 대기열 항목
     * @param durationSec 시작 시각과 종료 시각의 차이(초)
     */
    private void persistEndedCallSession(QueueEntry entry, long durationSec) {
        CallSession session = newCallSession(entry, CallSessionStatus.ENDED);
        ReflectionTestUtils.setField(session, "startedAt", NOW);
        ReflectionTestUtils.setField(session, "endsAt", NOW.plusSeconds(durationSec));
        ReflectionTestUtils.setField(session, "endedAt", NOW.plusSeconds(durationSec));
        ReflectionTestUtils.setField(session, "endReason", CallEndReason.TIMEOUT);
        entityManager.persist(session);
    }

    /** 연결에 실패한 영상통화 세션을 저장한다. */
    private void persistFailedCallSession(QueueEntry entry) {
        CallSession session = newCallSession(entry, CallSessionStatus.FAILED);
        ReflectionTestUtils.setField(session, "endedAt", NOW);
        ReflectionTestUtils.setField(session, "endReason", CallEndReason.CONNECTION_FAILED);
        entityManager.persist(session);
    }

    /** 대기열 항목에 연결된 지정 상태의 영상통화 세션을 만든다. */
    private CallSession newCallSession(QueueEntry entry, CallSessionStatus status) {
        CallSession session = BeanUtils.instantiateClass(CallSession.class);
        ReflectionTestUtils.setField(session, "queueEntry", entry);
        ReflectionTestUtils.setField(session, "roomId", "meeting-room-" + entry.getMeeting().getId());
        ReflectionTestUtils.setField(session, "fanLanguage", "KOREAN");
        ReflectionTestUtils.setField(session, "status", status);
        return session;
    }
}
