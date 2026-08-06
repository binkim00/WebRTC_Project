package com.ssafy.backend.influencer.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.influencer.dto.ParticipantFanSummaryResponse;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.domain.ParticipantSelectionType;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:participant-fan-query;MODE=MySQL;DB_CLOSE_DELAY=-1",
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
@Transactional
class ParticipantFanIntegrationTest {

    private static final LocalDateTime JUNE = LocalDateTime.of(2026, 6, 1, 19, 0);
    private static final LocalDateTime JULY = LocalDateTime.of(2026, 7, 1, 19, 0);
    private static final LocalDateTime AUGUST = LocalDateTime.of(2026, 8, 1, 19, 0);

    @Autowired
    private ParticipantFanService participantFanService;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    private User host;
    private User otherHost;
    private User firstFan;
    private User secondFan;
    private User otherHostFan;
    private AuthenticatedUser principal;

    @BeforeEach
    void setUp() {
        host = saveUser("participant-fan-host", UserRole.INFLUENCER);
        otherHost = saveUser("participant-fan-other-host", UserRole.SOLO_INFLUENCER);
        firstFan = saveUser("participant-fan-first", UserRole.FAN);
        secondFan = saveUser("participant-fan-second", UserRole.FAN);
        otherHostFan = saveUser("participant-fan-other", UserRole.FAN);
        principal = new AuthenticatedUser(host.getId(), UserRole.INFLUENCER);

        // 같은 팬이 여러 회차에 참가한 상황: 7월·8월 회차를 모두 종료 상태로 둔다.
        FanMeeting july = saveMeeting(host, "7월 팬미팅", FanMeetingStatus.ENDED, JULY, JULY);
        FanMeeting august = saveMeeting(host, "8월 팬미팅", FanMeetingStatus.ENDED, AUGUST, AUGUST);
        // 실제 시작 시각이 없는 종료 회차: 예정 시작 시각으로 폴백하는지 확인하는 데 쓴다.
        FanMeeting june = saveMeeting(host, "6월 팬미팅", FanMeetingStatus.ENDED, JUNE, null);
        // 아직 진행 중인 회차와 다른 개최자의 회차는 집계에서 빠져야 한다.
        FanMeeting live = saveMeeting(host, "진행 중 팬미팅", FanMeetingStatus.LIVE, AUGUST, AUGUST);
        FanMeeting otherHosted =
                saveMeeting(otherHost, "다른 개최자 팬미팅", FanMeetingStatus.ENDED, AUGUST, AUGUST);

        saveParticipant(july, firstFan, 1);
        saveParticipant(august, firstFan, 1);
        saveParticipant(live, firstFan, 2);
        saveParticipant(june, secondFan, 1);
        saveParticipant(otherHosted, otherHostFan, 1);

        entityManager.flush();
        entityManager.clear();
    }

    /**
     * 여러 회차에 참가한 팬이 한 건으로 합쳐지고 참여 횟수와 첫·최근 참여일이 개최일 기준으로
     * 집계되는지, 최근 참여일 내림차순으로 정렬되는지 검증한다.
     */
    @Test
    void aggregatesEachFanOnceWithParticipationCountAndDates() {
        PageResponse<ParticipantFanSummaryResponse> response =
                participantFanService.getMyParticipantFans(0, 20, principal);

        assertThat(response.content()).extracting(ParticipantFanSummaryResponse::fanId)
                .containsExactly(firstFan.getId(), secondFan.getId());
        assertThat(response.totalElements()).isEqualTo(2L);

        ParticipantFanSummaryResponse first = response.content().get(0);
        assertThat(first.nickname()).isEqualTo(firstFan.getNickname());
        assertThat(first.participatedMeetingCount()).isEqualTo(2L);
        assertThat(first.firstParticipatedAt()).isEqualTo(JULY);
        assertThat(first.lastParticipatedAt()).isEqualTo(AUGUST);
    }

    /** 다른 인플루언서가 개최한 팬미팅의 참가자가 결과에 포함되지 않는지 검증한다. */
    @Test
    void excludesFansOfMeetingsHostedByOtherInfluencer() {
        PageResponse<ParticipantFanSummaryResponse> response =
                participantFanService.getMyParticipantFans(0, 20, principal);

        assertThat(response.content()).extracting(ParticipantFanSummaryResponse::fanId)
                .doesNotContain(otherHostFan.getId());
    }

    /**
     * 종료되지 않은 팬미팅의 참가 이력이 참여 횟수에 더해지지 않는지 검증한다.
     * 첫 번째 팬은 진행 중 회차에도 참가자로 확정되어 있으나 횟수는 종료된 두 회차만 반영해야 한다.
     */
    @Test
    void excludesParticipationOfMeetingsNotEnded() {
        PageResponse<ParticipantFanSummaryResponse> response =
                participantFanService.getMyParticipantFans(0, 20, principal);

        ParticipantFanSummaryResponse first = response.content().stream()
                .filter(summary -> summary.fanId().equals(firstFan.getId()))
                .findFirst()
                .orElseThrow();
        assertThat(first.participatedMeetingCount()).isEqualTo(2L);
        assertThat(first.lastParticipatedAt()).isEqualTo(AUGUST);
    }

    /** 실제 시작 시각이 없는 팬미팅은 예정 시작 시각을 참여일로 사용하는지 검증한다. */
    @Test
    void fallsBackToScheduledStartAtWhenActualStartIsMissing() {
        PageResponse<ParticipantFanSummaryResponse> response =
                participantFanService.getMyParticipantFans(0, 20, principal);

        ParticipantFanSummaryResponse second = response.content().stream()
                .filter(summary -> summary.fanId().equals(secondFan.getId()))
                .findFirst()
                .orElseThrow();
        assertThat(second.firstParticipatedAt()).isEqualTo(JUNE);
        assertThat(second.lastParticipatedAt()).isEqualTo(JUNE);
    }

    /** 집계 결과가 팬 단위로 페이징되고 전체 건수는 중복을 제거한 팬 수와 같은지 검증한다. */
    @Test
    void paginatesByDistinctFan() {
        PageResponse<ParticipantFanSummaryResponse> firstPage =
                participantFanService.getMyParticipantFans(0, 1, principal);

        assertThat(firstPage.content()).extracting(ParticipantFanSummaryResponse::fanId)
                .containsExactly(firstFan.getId());
        assertThat(firstPage.totalElements()).isEqualTo(2L);
        assertThat(firstPage.totalPages()).isEqualTo(2);
        assertThat(firstPage.hasNext()).isTrue();

        PageResponse<ParticipantFanSummaryResponse> secondPage =
                participantFanService.getMyParticipantFans(1, 1, principal);

        assertThat(secondPage.content()).extracting(ParticipantFanSummaryResponse::fanId)
                .containsExactly(secondFan.getId());
        assertThat(secondPage.hasNext()).isFalse();
    }

    /**
     * 팬과 참가 이력이 늘어나도 실행되는 쿼리 수가 그대로인지 검증한다.
     * 집계와 팬 정보를 한 번에 투영하므로 팬 수에 비례해 조회가 늘어나지 않아야 한다.
     */
    @Test
    void keepsQueryCountConstantAsFansGrow() {
        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.clear();
        participantFanService.getMyParticipantFans(0, 20, principal);
        long baseline = statistics.getPrepareStatementCount();

        FanMeeting extra = saveMeeting(host, "추가 팬미팅", FanMeetingStatus.ENDED, AUGUST, AUGUST);
        for (int index = 1; index <= 5; index++) {
            saveParticipant(extra, saveUser("participant-fan-extra-" + index, UserRole.FAN), index);
        }
        entityManager.flush();
        entityManager.clear();

        statistics.clear();
        PageResponse<ParticipantFanSummaryResponse> response =
                participantFanService.getMyParticipantFans(0, 20, principal);

        assertThat(response.totalElements()).isEqualTo(7L);
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(baseline);
    }

    /**
     * 통합 테스트에 사용할 사용자를 저장한다.
     *
     * @param loginId 로그인 식별자이며 닉네임과 이메일에도 사용한다
     * @param role 사용자 역할
     * @return 저장된 활성 사용자
     */
    private User saveUser(String loginId, UserRole role) {
        User user = User.createActive(
                loginId, loginId + "@example.com", "encoded-password", loginId,
                role, PreferredLanguage.KOREAN
        );
        entityManager.persist(user);
        return user;
    }

    /**
     * 통합 테스트에 사용할 팬미팅을 원하는 상태와 개최일로 저장한다.
     *
     * @param influencer 팬미팅을 개최한 인플루언서
     * @param title 팬미팅 제목
     * @param status 팬미팅 상태
     * @param scheduledStartAt 예정 시작 시각
     * @param actualStartAt 실제 시작 시각이며 null이면 예정 시작 시각으로 폴백하는 상황을 만든다
     * @return 저장된 팬미팅
     */
    private FanMeeting saveMeeting(User influencer, String title, FanMeetingStatus status,
                                   LocalDateTime scheduledStartAt, LocalDateTime actualStartAt) {
        FanMeeting meeting = FanMeeting.create(
                null, null, influencer, title, "설명", null,
                scheduledStartAt, ParticipantSelectionType.APPLICATION
        );
        meeting.forceControl(status, scheduledStartAt);
        ReflectionTestUtils.setField(meeting, "actualStartAt", actualStartAt);
        entityManager.persist(meeting);
        return meeting;
    }

    /**
     * 응모 없이 참가자를 확정해 저장한다.
     *
     * @param meeting 참가할 팬미팅
     * @param fan 참가 팬
     * @param assignedOrder 1부터 시작하는 호출 순번
     */
    private void saveParticipant(FanMeeting meeting, User fan, int assignedOrder) {
        Participant participant =
                Participant.createFromExternalSelection(meeting, fan, assignedOrder);
        entityManager.persist(participant);
    }
}
