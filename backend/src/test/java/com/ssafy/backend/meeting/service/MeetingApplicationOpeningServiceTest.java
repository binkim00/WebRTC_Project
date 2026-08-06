package com.ssafy.backend.meeting.service;

import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.meeting.repository.MeetingApplicationSettingRepository;
import com.ssafy.backend.user.domain.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MeetingApplicationOpeningServiceTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Instant NOW = Instant.parse("2026-07-30T00:00:00Z");

    private FanMeetingRepository fanMeetingRepository;
    private MeetingApplicationSettingRepository applicationSettingRepository;
    private MeetingApplicationOpeningService service;

    /** 각 테스트에서 사용할 응모 시작 서비스와 협력 객체를 고정 시계로 구성한다. */
    @BeforeEach
    void setUp() {
        fanMeetingRepository = mock(FanMeetingRepository.class);
        applicationSettingRepository = mock(MeetingApplicationSettingRepository.class);
        service = new MeetingApplicationOpeningService(
                fanMeetingRepository, applicationSettingRepository, Clock.fixed(NOW, SEOUL)
        );
    }

    /** 전환 후보 조회가 현재 시각을 그대로 저장소 질의에 넘기는지 검증한다. */
    @Test
    void findsOpenTargetIdsWithCurrentTime() {
        when(applicationSettingRepository.findApplicationOpenTargetIds(now()))
                .thenReturn(List.of(1L, 2L));

        assertThat(service.findOpenTargetIds()).containsExactly(1L, 2L);
    }

    /** 응모 기간에 들어선 공개 팬미팅을 응모 접수 상태로 전환하는지 검증한다. */
    @Test
    void opensApplicationsWhenPeriodStarted() {
        FanMeeting meeting = publishedMeeting();
        stubMeeting(meeting, applicationSetting(meeting, true, now().minusHours(1),
                now().plusDays(1)));

        assertThat(service.openIfDue(1L)).isTrue();
        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.APPLICATION_OPEN);
    }

    /** 응모 시작 시각이 아직 오지 않았으면 공개 상태를 유지하는지 검증한다. */
    @Test
    void keepsPublishedWhenApplicationNotStarted() {
        FanMeeting meeting = publishedMeeting();
        stubMeeting(meeting, applicationSetting(meeting, true, now().plusHours(1),
                now().plusDays(1)));

        assertThat(service.openIfDue(1L)).isFalse();
        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.PUBLISHED);
    }

    /** 응모 종료 시각이 이미 지난 팬미팅은 뒤늦게 열지 않는지 검증한다. */
    @Test
    void keepsPublishedWhenApplicationAlreadyClosed() {
        FanMeeting meeting = publishedMeeting();
        stubMeeting(meeting, applicationSetting(meeting, true, now().minusDays(2),
                now().minusDays(1)));

        assertThat(service.openIfDue(1L)).isFalse();
        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.PUBLISHED);
    }

    /** 응모 기능을 쓰지 않는 팬미팅은 기간이 지나도 열지 않는지 검증한다. */
    @Test
    void keepsPublishedWhenApplicationDisabled() {
        FanMeeting meeting = publishedMeeting();
        stubMeeting(meeting, applicationSetting(meeting, false, now().minusHours(1),
                now().plusDays(1)));

        assertThat(service.openIfDue(1L)).isFalse();
        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.PUBLISHED);
    }

    /** 응모 설정이 없는 팬미팅은 전환하지 않는지 검증한다. */
    @Test
    void keepsPublishedWhenApplicationSettingMissing() {
        FanMeeting meeting = publishedMeeting();
        when(fanMeetingRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(meeting));
        when(applicationSettingRepository.findById(1L)).thenReturn(Optional.empty());

        assertThat(service.openIfDue(1L)).isFalse();
        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.PUBLISHED);
    }

    /** 다른 요청이 먼저 응모를 시작한 팬미팅은 중복 전환하지 않는지 검증한다. */
    @Test
    void skipsMeetingAlreadyOpened() {
        FanMeeting meeting = publishedMeeting();
        meeting.openApplications();
        when(fanMeetingRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(meeting));

        assertThat(service.openIfDue(1L)).isFalse();
        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.APPLICATION_OPEN);
    }

    /** 논리 삭제된 팬미팅은 전환 대상에서 제외하는지 검증한다. */
    @Test
    void skipsDeletedMeeting() {
        FanMeeting meeting = publishedMeeting();
        ReflectionTestUtils.setField(meeting, "deletedAt", now().minusDays(1));
        when(fanMeetingRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(meeting));

        assertThat(service.openIfDue(1L)).isFalse();
        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.PUBLISHED);
    }

    /** 조회 이후 삭제되어 팬미팅을 찾지 못하면 조용히 건너뛰는지 검증한다. */
    @Test
    void skipsMissingMeeting() {
        when(fanMeetingRepository.findByIdForUpdate(1L)).thenReturn(Optional.empty());

        assertThat(service.openIfDue(1L)).isFalse();
    }

    /** 마감 후보 조회가 현재 시각을 그대로 저장소 질의에 넘기는지 검증한다. */
    @Test
    void findsCloseTargetIdsWithCurrentTime() {
        when(applicationSettingRepository.findApplicationCloseTargetIds(now()))
                .thenReturn(List.of(3L, 4L));

        assertThat(service.findCloseTargetIds()).containsExactly(3L, 4L);
    }

    /**
     * 마감 시각이 지난 접수 중 팬미팅을 마감 상태로 넘기는지 검증한다.
     *
     * <p>접수는 응모 서비스가 시각으로도 막지만, 상태가 남아 있으면 화면에는 "모집 중"으로
     * 계속 보인다. 시작을 자동으로 열어 주는 것과 짝을 맞춘다.
     */
    @Test
    void closesApplicationsWhenPeriodEnded() {
        FanMeeting meeting = publishedMeeting();
        meeting.openApplications();
        stubMeeting(meeting, applicationSetting(meeting, true, now().minusDays(2),
                now().minusMinutes(1)));

        assertThat(service.closeIfDue(1L)).isTrue();
        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.APPLICATION_CLOSED);
    }

    /** 마감 시각 전에는 접수 상태를 유지하는지 검증한다. */
    @Test
    void keepsOpenBeforeCloseTime() {
        FanMeeting meeting = publishedMeeting();
        meeting.openApplications();
        stubMeeting(meeting, applicationSetting(meeting, true, now().minusDays(1),
                now().plusHours(1)));

        assertThat(service.closeIfDue(1L)).isFalse();
        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.APPLICATION_OPEN);
    }

    /** 이미 매니저가 손으로 마감한 팬미팅은 다시 마감하지 않는지 검증한다. */
    @Test
    void skipsMeetingAlreadyClosed() {
        FanMeeting meeting = publishedMeeting();
        meeting.openApplications();
        meeting.closeApplications();
        when(fanMeetingRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(meeting));

        assertThat(service.closeIfDue(1L)).isFalse();
        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.APPLICATION_CLOSED);
    }

    /** 잠금 조회와 응모 설정 조회가 주어진 값을 반환하도록 대역을 설정한다. */
    private void stubMeeting(FanMeeting meeting, MeetingApplicationSetting setting) {
        when(fanMeetingRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(meeting));
        when(applicationSettingRepository.findById(1L)).thenReturn(Optional.of(setting));
    }

    /** 테스트용 공개 팬미팅을 생성하고 영속 식별자를 설정한다. */
    private FanMeeting publishedMeeting() {
        FanMeeting meeting = FanMeeting.create(
                null, null, mock(User.class), "팬미팅", null, null, now().plusDays(10)
        );
        ReflectionTestUtils.setField(meeting, "id", 1L);
        meeting.publish(now().minusDays(1));
        return meeting;
    }

    /** 지정한 사용 여부와 응모 기간을 가진 응모 설정을 생성한다. */
    private MeetingApplicationSetting applicationSetting(FanMeeting meeting, boolean enabled,
                                                         LocalDateTime openAt,
                                                         LocalDateTime closeAt) {
        return MeetingApplicationSetting.create(
                meeting, enabled, openAt, closeAt, closeAt.plusDays(1), 20
        );
    }

    /** 고정 시계 기준 현재 시각을 반환한다. */
    private LocalDateTime now() {
        return LocalDateTime.now(Clock.fixed(NOW, SEOUL));
    }
}
