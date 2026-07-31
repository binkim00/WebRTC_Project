package com.ssafy.backend.common.entity;

import com.ssafy.backend.ai.repository.AiCallSummaryRepository;
import com.ssafy.backend.ai.repository.AiModerationRepository;
import com.ssafy.backend.ai.repository.AiSessionRepository;
import com.ssafy.backend.ai.repository.AiSubtitleRepository;
import com.ssafy.backend.ai.repository.FanCardRepository;
import com.ssafy.backend.application.repository.ApplicationAnswerRepository;
import com.ssafy.backend.application.repository.ApplicationFormRepository;
import com.ssafy.backend.application.repository.ApplicationOptionRepository;
import com.ssafy.backend.application.repository.ApplicationQuestionRepository;
import com.ssafy.backend.application.repository.ApplicationRepository;
import com.ssafy.backend.call.repository.CallSessionRepository;
import com.ssafy.backend.device.repository.DeviceCheckRepository;
import com.ssafy.backend.influencer.repository.FanMemoRepository;
import com.ssafy.backend.influencer.repository.FollowingRepository;
import com.ssafy.backend.influencer.repository.InfluencerProfileRepository;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.meeting.repository.MeetingApplicationSettingRepository;
import com.ssafy.backend.meeting.repository.MeetingOperationSettingRepository;
import com.ssafy.backend.notification.repository.NotificationRepository;
import com.ssafy.backend.organization.repository.OrganizationMemberRepository;
import com.ssafy.backend.organization.repository.OrganizationRepository;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.post.repository.AttachmentRepository;
import com.ssafy.backend.post.repository.CommentReportRepository;
import com.ssafy.backend.post.repository.PostCommentRepository;
import com.ssafy.backend.post.repository.PostRepository;
import com.ssafy.backend.queue.repository.QueueChangeRequestRepository;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import com.ssafy.backend.recording.repository.RecordingRepository;
import com.ssafy.backend.user.repository.UserRepository;
import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.application.domain.ApplicationStatus;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.domain.CallSessionStatus;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.ListableBeanFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:erd;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
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
class ErdSchemaIntegrationTest {

    private static final Set<String> EXPECTED_TABLES = Set.of(
            "users",
            "influencer_profiles",
            "followings",
            "fan_memos",
            "organizations",
            "organization_members",
            "fan_meetings",
            "meeting_application_settings",
            "meeting_operation_settings",
            "application_forms",
            "application_questions",
            "application_options",
            "applications",
            "application_answers",
            "participants",
            "device_checks",
            "queue_entries",
            "queue_change_requests",
            "call_sessions",
            "ai_sessions",
            "ai_subtitle",
            "ai_moderation",
            "ai_call_summary",
            "fan_card",
            "recordings",
            "notifications",
            "posts",
            "post_comments",
            "attachments",
            "comment_reports"
    );

    private final DataSource dataSource;
    private final ListableBeanFactory beanFactory;
    private final EntityManager entityManager;

    /**
     * ERD 스키마 통합 테스트에 필요한 데이터소스와 빈 팩토리를 주입받는다.
     *
     * @param dataSource H2 테스트 데이터소스
     * @param beanFactory Repository 빈 조회에 사용할 빈 팩토리
     * @param entityManager 핵심 연관관계 저장과 조회에 사용할 엔티티 매니저
     */
    @Autowired
    ErdSchemaIntegrationTest(DataSource dataSource, ListableBeanFactory beanFactory, EntityManager entityManager) {
        this.dataSource = dataSource;
        this.beanFactory = beanFactory;
        this.entityManager = entityManager;
    }

    /**
     * 최신 ERD의 30개 테이블이 실제 스키마로 생성되는지 검증한다.
     *
     * @throws Exception JDBC 메타데이터 조회에 실패한 경우
     */
    @Test
    void createsAllErdTables() throws Exception {
        Set<String> actualTables = new HashSet<>();

        try (Connection connection = dataSource.getConnection();
             ResultSet tables = connection.getMetaData().getTables(null, null, "%", new String[]{"TABLE"})) {
            while (tables.next()) {
                actualTables.add(tables.getString("TABLE_NAME").toLowerCase(Locale.ROOT));
            }
        }

        assertThat(actualTables).containsAll(EXPECTED_TABLES);
    }

    /**
     * 팬미팅부터 영상통화까지 이어지는 핵심 엔티티 연관관계가 저장되고 다시 조회되는지 검증한다.
     */
    @Test
    @Transactional
    void persistsAndLoadsCoreFanMeetingRelationships() {
        User influencer = User.createActive(
                "erd-influencer", "influencer@erd.test", "encoded", "인플루언서",
                UserRole.INFLUENCER, PreferredLanguage.KOREAN
        );
        User fan = User.createActive(
                "erd-fan", "fan@erd.test", "encoded", "팬",
                UserRole.FAN, PreferredLanguage.ENGLISH
        );
        entityManager.persist(influencer);
        entityManager.persist(fan);

        LocalDateTime now = LocalDateTime.now();
        FanMeeting meeting = instantiate(FanMeeting.class);
        ReflectionTestUtils.setField(meeting, "influencer", influencer);
        ReflectionTestUtils.setField(meeting, "title", "ERD 관계 테스트 팬미팅");
        ReflectionTestUtils.setField(meeting, "status", FanMeetingStatus.DRAFT);
        ReflectionTestUtils.setField(meeting, "scheduledStartAt", now.plusDays(1));
        entityManager.persist(meeting);

        Application application = instantiate(Application.class);
        ReflectionTestUtils.setField(application, "meeting", meeting);
        ReflectionTestUtils.setField(application, "fan", fan);
        ReflectionTestUtils.setField(application, "status", ApplicationStatus.SELECTED);
        ReflectionTestUtils.setField(application, "personalInformationConsentAt", now);
        ReflectionTestUtils.setField(application, "submittedAt", now);
        entityManager.persist(application);

        Participant participant = instantiate(Participant.class);
        ReflectionTestUtils.setField(participant, "meeting", meeting);
        ReflectionTestUtils.setField(participant, "fan", fan);
        ReflectionTestUtils.setField(participant, "application", application);
        ReflectionTestUtils.setField(participant, "status", "READY");
        ReflectionTestUtils.setField(participant, "assignedOrder", 1);
        entityManager.persist(participant);

        QueueEntry queueEntry = instantiate(QueueEntry.class);
        ReflectionTestUtils.setField(queueEntry, "meeting", meeting);
        ReflectionTestUtils.setField(queueEntry, "participant", participant);
        ReflectionTestUtils.setField(queueEntry, "queuePosition", 1);
        ReflectionTestUtils.setField(queueEntry, "status", QueueEntryStatus.CALLED);
        ReflectionTestUtils.setField(queueEntry, "recallCount", 0);
        entityManager.persist(queueEntry);

        CallSession callSession = instantiate(CallSession.class);
        ReflectionTestUtils.setField(callSession, "queueEntry", queueEntry);
        ReflectionTestUtils.setField(callSession, "roomId", "meeting-room-1");
        ReflectionTestUtils.setField(callSession, "fanLanguage", "en");
        ReflectionTestUtils.setField(callSession, "status", CallSessionStatus.CONNECTING);
        entityManager.persist(callSession);
        entityManager.flush();
        Long callSessionId = callSession.getId();
        entityManager.clear();

        CallSession loaded = entityManager.find(CallSession.class, callSessionId);

        assertThat(loaded).isNotNull();
        assertThat(loaded.getQueueEntry().getParticipant().getApplication().getMeeting().getTitle())
                .isEqualTo("ERD 관계 테스트 팬미팅");
        assertThat(loaded.getQueueEntry().getParticipant().getFan().getLoginId()).isEqualTo("erd-fan");
    }

    /**
     * ERD의 각 테이블에 대응하는 Spring Data JPA Repository가 빈으로 등록되는지 검증한다.
     */
    @Test
    void registersRepositoryForEveryErdEntity() {
        List<Class<?>> repositoryTypes = List.of(
                UserRepository.class,
                InfluencerProfileRepository.class,
                FollowingRepository.class,
                FanMemoRepository.class,
                OrganizationRepository.class,
                OrganizationMemberRepository.class,
                FanMeetingRepository.class,
                MeetingApplicationSettingRepository.class,
                MeetingOperationSettingRepository.class,
                ApplicationFormRepository.class,
                ApplicationQuestionRepository.class,
                ApplicationOptionRepository.class,
                ApplicationRepository.class,
                ApplicationAnswerRepository.class,
                ParticipantRepository.class,
                DeviceCheckRepository.class,
                QueueEntryRepository.class,
                QueueChangeRequestRepository.class,
                CallSessionRepository.class,
                AiSessionRepository.class,
                AiSubtitleRepository.class,
                AiModerationRepository.class,
                AiCallSummaryRepository.class,
                FanCardRepository.class,
                RecordingRepository.class,
                NotificationRepository.class,
                PostRepository.class,
                PostCommentRepository.class,
                AttachmentRepository.class,
                CommentReportRepository.class
        );

        assertThat(repositoryTypes)
                .hasSize(EXPECTED_TABLES.size())
                .allSatisfy(repositoryType -> assertThat(beanFactory.getBean(repositoryType)).isNotNull());
    }

    /**
     * JPA 기본 생성자를 사용해 테스트용 엔티티 인스턴스를 만든다.
     *
     * @param type 생성할 엔티티 타입
     * @param <T> 엔티티 타입
     * @return 생성된 엔티티
     */
    private <T> T instantiate(Class<T> type) {
        return BeanUtils.instantiateClass(type);
    }
}
