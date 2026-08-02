package com.ssafy.backend.meeting.service;

import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.meeting.repository.MeetingApplicationSettingRepository;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 실제 H2 데이터베이스로 응모 시작 스케줄러의 전환 대상 조회와 상태 전이를 검증한다.
 *
 * <p>응모 시작 시각이 지나도 팬미팅이 공개 상태에 머물러 팬이 응모하지 못하던 문제를 막기 위해,
 * 후보 조회 조건과 실제 상태 전환을 저장소 질의까지 포함해 확인한다.
 */
@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:meeting-application-opening;MODE=MySQL;DB_CLOSE_DELAY=-1",
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
@Transactional
class MeetingApplicationOpeningIntegrationTest {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private FanMeetingRepository fanMeetingRepository;

    @Autowired
    private MeetingApplicationSettingRepository applicationSettingRepository;

    @Autowired
    private MeetingApplicationOpeningService openingService;

    @Autowired
    private MeetingApplicationOpeningScheduler scheduler;

    @Autowired
    private EntityManager entityManager;

    private User influencer;

    /** 각 테스트에서 팬미팅을 진행할 인플루언서를 저장한다. */
    @BeforeEach
    void setUp() {
        influencer = saveUser("opening-influencer", "응모시작인플루언서");
    }

    /** 응모 시작 시각이 지난 공개 팬미팅이 스케줄러 실행으로 응모 접수 상태가 되는지 검증한다. */
    @Test
    void opensPublishedMeetingWhenApplicationPeriodStarted() {
        FanMeeting meeting = publishedMeeting("응모 시작된 팬미팅");
        saveSetting(meeting, true, LocalDateTime.now().minusHours(1),
                LocalDateTime.now().plusDays(1));

        assertThat(openingService.findOpenTargetIds()).contains(meeting.getId());

        scheduler.openDueApplications();
        entityManager.flush();
        entityManager.clear();

        assertThat(fanMeetingRepository.findById(meeting.getId()).orElseThrow().getStatus())
                .isEqualTo(FanMeetingStatus.APPLICATION_OPEN);
    }

    /** 응모 시작 시각 전인 팬미팅은 후보에서 제외되고 공개 상태를 유지하는지 검증한다. */
    @Test
    void keepsMeetingPublishedBeforeApplicationOpenAt() {
        FanMeeting meeting = publishedMeeting("응모 예정 팬미팅");
        saveSetting(meeting, true, LocalDateTime.now().plusHours(1),
                LocalDateTime.now().plusDays(1));

        assertThat(openingService.findOpenTargetIds()).doesNotContain(meeting.getId());

        scheduler.openDueApplications();
        entityManager.flush();
        entityManager.clear();

        assertThat(fanMeetingRepository.findById(meeting.getId()).orElseThrow().getStatus())
                .isEqualTo(FanMeetingStatus.PUBLISHED);
    }

    /** 응모 종료 시각이 이미 지난 팬미팅은 뒤늦게 열지 않는지 검증한다. */
    @Test
    void keepsMeetingPublishedAfterApplicationCloseAt() {
        FanMeeting meeting = publishedMeeting("응모 기간이 끝난 팬미팅");
        saveSetting(meeting, true, LocalDateTime.now().minusDays(2),
                LocalDateTime.now().minusDays(1));

        assertThat(openingService.findOpenTargetIds()).doesNotContain(meeting.getId());
    }

    /** 응모 기능을 쓰지 않는 팬미팅은 기간이 지나도 후보에 오르지 않는지 검증한다. */
    @Test
    void excludesMeetingWithApplicationDisabled() {
        FanMeeting meeting = publishedMeeting("응모를 쓰지 않는 팬미팅");
        saveSetting(meeting, false, LocalDateTime.now().minusHours(1),
                LocalDateTime.now().plusDays(1));

        assertThat(openingService.findOpenTargetIds()).doesNotContain(meeting.getId());
    }

    /** 아직 공개하지 않은 초안 팬미팅은 후보에 오르지 않는지 검증한다. */
    @Test
    void excludesDraftMeeting() {
        FanMeeting meeting = fanMeetingRepository.saveAndFlush(FanMeeting.create(
                null, null, influencer, "초안 팬미팅", null, null,
                LocalDateTime.now().plusDays(10)
        ));
        saveSetting(meeting, true, LocalDateTime.now().minusHours(1),
                LocalDateTime.now().plusDays(1));

        assertThat(openingService.findOpenTargetIds()).doesNotContain(meeting.getId());
    }

    /** 논리 삭제된 팬미팅은 후보에 오르지 않는지 검증한다. */
    @Test
    void excludesDeletedMeeting() {
        FanMeeting meeting = fanMeetingRepository.saveAndFlush(FanMeeting.create(
                null, null, influencer, "삭제된 팬미팅", null, null,
                LocalDateTime.now().plusDays(10)
        ));
        meeting.deleteDraft(LocalDateTime.now().minusHours(2));
        fanMeetingRepository.saveAndFlush(meeting);
        saveSetting(meeting, true, LocalDateTime.now().minusHours(1),
                LocalDateTime.now().plusDays(1));

        assertThat(openingService.findOpenTargetIds()).doesNotContain(meeting.getId());
    }

    /** 이미 응모 접수 중인 팬미팅은 다시 전환 대상이 되지 않는지 검증한다. */
    @Test
    void excludesAlreadyOpenedMeeting() {
        FanMeeting meeting = publishedMeeting("이미 응모 중인 팬미팅");
        meeting.openApplications();
        fanMeetingRepository.saveAndFlush(meeting);
        saveSetting(meeting, true, LocalDateTime.now().minusHours(1),
                LocalDateTime.now().plusDays(1));

        assertThat(openingService.findOpenTargetIds()).doesNotContain(meeting.getId());
    }

    /** 공개 상태의 테스트용 팬미팅을 저장한다. */
    private FanMeeting publishedMeeting(String title) {
        FanMeeting meeting = fanMeetingRepository.saveAndFlush(FanMeeting.create(
                null, null, influencer, title, null, null, LocalDateTime.now().plusDays(10)
        ));
        meeting.publish(LocalDateTime.now().minusDays(1));
        return fanMeetingRepository.saveAndFlush(meeting);
    }

    /** 지정한 사용 여부와 응모 기간을 가진 응모 설정을 저장한다. */
    private void saveSetting(FanMeeting meeting, boolean enabled, LocalDateTime openAt,
                             LocalDateTime closeAt) {
        applicationSettingRepository.saveAndFlush(MeetingApplicationSetting.create(
                meeting, enabled, openAt, closeAt, closeAt.plusDays(1), 10
        ));
    }

    /** 테스트용 활성 인플루언서 사용자를 저장한다. */
    private User saveUser(String loginId, String nickname) {
        return userRepository.saveAndFlush(User.createActive(
                loginId, loginId + "@example.com", "encoded-password",
                nickname, UserRole.INFLUENCER, PreferredLanguage.KOREAN
        ));
    }
}
