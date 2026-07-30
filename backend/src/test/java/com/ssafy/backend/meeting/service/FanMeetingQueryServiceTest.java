package com.ssafy.backend.meeting.service;

import com.ssafy.backend.application.repository.ApplicationRepository;
import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.application.domain.ApplicationStatus;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import com.ssafy.backend.meeting.domain.MeetingOperationSetting;
import com.ssafy.backend.meeting.dto.FanMeetingDetailResponse;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.meeting.repository.MeetingApplicationSettingRepository;
import com.ssafy.backend.meeting.repository.MeetingOperationSettingRepository;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class FanMeetingQueryServiceTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Instant NOW = Instant.parse("2026-07-30T00:00:00Z");

    private CurrentUserService currentUserService;
    private FanMeetingRepository fanMeetingRepository;
    private MeetingApplicationSettingRepository applicationSettingRepository;
    private MeetingOperationSettingRepository operationSettingRepository;
    private ApplicationRepository applicationRepository;
    private ParticipantRepository participantRepository;
    private FanMeetingQueryService queryService;

    /** 각 테스트에서 사용할 저장소와 고정 시각 기반 조회 서비스를 구성한다. */
    @BeforeEach
    void setUp() {
        currentUserService = mock(CurrentUserService.class);
        fanMeetingRepository = mock(FanMeetingRepository.class);
        applicationSettingRepository = mock(MeetingApplicationSettingRepository.class);
        operationSettingRepository = mock(MeetingOperationSettingRepository.class);
        applicationRepository = mock(ApplicationRepository.class);
        participantRepository = mock(ParticipantRepository.class);
        queryService = new FanMeetingQueryService(
                currentUserService,
                fanMeetingRepository,
                applicationSettingRepository,
                operationSettingRepository,
                applicationRepository,
                participantRepository,
                Clock.fixed(NOW, SEOUL)
        );
    }

    /** 익명 사용자가 초안 팬미팅 상세를 조회할 때 존재하지 않는 것처럼 처리하는지 검증한다. */
    @Test
    void hidesDraftDetailFromAnonymousViewer() {
        FanMeeting meeting = meeting(mock(User.class));
        when(fanMeetingRepository.findById(1L)).thenReturn(Optional.of(meeting));

        assertThatThrownBy(() -> queryService.getDetail(1L, null))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.FAN_MEETING_NOT_FOUND));
    }

    /** 응모 중인 팬미팅을 아직 응모하지 않은 팬이 조회하면 응모 가능 상태인지 검증한다. */
    @Test
    void allowsFanToApplyDuringOpenPeriod() {
        User influencer = mock(User.class);
        when(influencer.getId()).thenReturn(10L);
        when(influencer.getNickname()).thenReturn("인플루언서");
        FanMeeting meeting = meeting(influencer);
        meeting.publish(LocalDateTime.now(Clock.fixed(NOW, SEOUL)).minusDays(2));
        meeting.openApplications();

        LocalDateTime now = LocalDateTime.now(Clock.fixed(NOW, SEOUL));
        MeetingApplicationSetting application = MeetingApplicationSetting.create(
                meeting, true, now.minusDays(1), now.plusDays(1), now.plusDays(2), 20
        );
        MeetingOperationSetting operation = MeetingOperationSetting.create(
                meeting, now.plusHours(1), 120, true, true
        );
        User fan = mock(User.class);
        when(fan.getId()).thenReturn(20L);
        when(fan.getRole()).thenReturn(UserRole.FAN);
        AuthenticatedUser principal = new AuthenticatedUser(20L, UserRole.FAN);

        when(fanMeetingRepository.findById(1L)).thenReturn(Optional.of(meeting));
        when(currentUserService.requireActiveUser(principal)).thenReturn(fan);
        when(applicationSettingRepository.findById(1L)).thenReturn(Optional.of(application));
        when(operationSettingRepository.findById(1L)).thenReturn(Optional.of(operation));
        when(applicationRepository.findByMeeting_IdAndFan_Id(1L, 20L))
                .thenReturn(Optional.empty());
        when(participantRepository.findByMeeting_IdAndFan_Id(1L, 20L))
                .thenReturn(Optional.empty());

        FanMeetingDetailResponse response = queryService.getDetail(1L, principal);

        assertThat(response.viewer().canApply()).isTrue();
        assertThat(response.viewer().canEnter()).isFalse();
        assertThat(response.viewer().applicationStatus()).isNull();
    }

    /** 취소 상태의 응모가 있는 팬에게 응모 기간 중 재응모 가능 상태를 제공하는지 검증한다. */
    @Test
    void allowsWithdrawnFanToReapplyDuringOpenPeriod() {
        User influencer = mock(User.class);
        when(influencer.getId()).thenReturn(10L);
        when(influencer.getNickname()).thenReturn("인플루언서");
        FanMeeting meeting = meeting(influencer);
        meeting.publish(LocalDateTime.now(Clock.fixed(NOW, SEOUL)).minusDays(2));
        meeting.openApplications();

        LocalDateTime now = LocalDateTime.now(Clock.fixed(NOW, SEOUL));
        MeetingApplicationSetting applicationSetting = MeetingApplicationSetting.create(
                meeting, true, now.minusDays(1), now.plusDays(1), now.plusDays(2), 20
        );
        MeetingOperationSetting operation = MeetingOperationSetting.create(
                meeting, now.plusHours(1), 120, true, true
        );
        User fan = mock(User.class);
        when(fan.getId()).thenReturn(20L);
        when(fan.getRole()).thenReturn(UserRole.FAN);
        Application withdrawn = Application.submit(meeting, fan, now.minusHours(2));
        withdrawn.withdraw(now.minusHours(1));
        AuthenticatedUser principal = new AuthenticatedUser(20L, UserRole.FAN);

        when(fanMeetingRepository.findById(1L)).thenReturn(Optional.of(meeting));
        when(currentUserService.requireActiveUser(principal)).thenReturn(fan);
        when(applicationSettingRepository.findById(1L)).thenReturn(Optional.of(applicationSetting));
        when(operationSettingRepository.findById(1L)).thenReturn(Optional.of(operation));
        when(applicationRepository.findByMeeting_IdAndFan_Id(1L, 20L))
                .thenReturn(Optional.of(withdrawn));
        when(participantRepository.findByMeeting_IdAndFan_Id(1L, 20L))
                .thenReturn(Optional.empty());

        FanMeetingDetailResponse response = queryService.getDetail(1L, principal);

        assertThat(response.viewer().applicationStatus()).isEqualTo(ApplicationStatus.WITHDRAWN);
        assertThat(response.viewer().canApply()).isTrue();
    }

    /** 공개 목록에서 초안 상태 필터를 요청하면 잘못된 요청으로 거부하는지 검증한다. */
    @Test
    void rejectsPrivateStatusFromPublicList() {
        assertThatThrownBy(() -> queryService.getPublicMeetings(
                null, FanMeetingStatus.DRAFT, 0, 20, null
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_REQUEST));
    }

    /** 테스트용 초안 팬미팅을 생성하고 식별자를 설정한다. */
    private FanMeeting meeting(User influencer) {
        FanMeeting meeting = FanMeeting.create(
                null, null, influencer, "팬미팅", null, null,
                LocalDateTime.now(Clock.fixed(NOW, SEOUL)).plusDays(10)
        );
        org.springframework.test.util.ReflectionTestUtils.setField(meeting, "id", 1L);
        return meeting;
    }
}
